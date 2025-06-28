import express from "express";
import WebSocket, { WebSocketServer } from "ws";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import http from "http";
import Twilio from "twilio";
import axios from "axios";
import { updateOne } from "./mongo-helper.js";
import { makePostRequest } from "./rest-helper.js";

dotenv.config();

const {
  ELEVENLABS_API_KEY,
  ELEVENLABS_AGENT_ID,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
} = process.env;

if (
  !ELEVENLABS_API_KEY ||
  !ELEVENLABS_AGENT_ID ||
  !TWILIO_ACCOUNT_SID ||
  !TWILIO_AUTH_TOKEN ||
  !TWILIO_PHONE_NUMBER
) {
  throw new Error("Missing required environment variables");
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const promptStore = new Map();
const transcriptStore = new Map();

const PORT = 8000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send({ message: "Server is running" });
});

server.listen(PORT, () => {
  console.log(`[Server] Listening on port ${PORT}`);
});

const twilioClient = Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

async function getSignedUrl() {
  const response = await axios.get(
    "https://api.elevenlabs.io/v1/convai/conversation/get_signed_url",
    {
      params: { agent_id: ELEVENLABS_AGENT_ID },
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
    }
  );
  return response.data.signed_url;
}

app.post("/outbound-call", async (req, res) => {
  const { number, prompt, first_message } = req.body;
  if (!number)
    return res.status(400).send({ error: "Phone number is required" });

  try {
    const id = Date.now().toString();
    const call = await twilioClient.calls.create({
      from: TWILIO_PHONE_NUMBER,
      to: number,
      url: `https://${req.headers.host}/outbound-call-twiml?id=${id}`,
    });

    promptStore.set(id, { prompt, first_message });

    res.send({ success: true, message: "Call initiated", callSid: call.sid });
  } catch (error) {
    console.error("Error initiating outbound call:", error);
    res.status(500).send({ success: false, error: "Failed to initiate call" });
  }
});

app.all("/outbound-call-twiml", (req, res) => {
  const data = promptStore.get(req?.query?.id) || {};

  function escapeXml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Connect>
        <Stream url="wss://${req.headers.host}/outbound-media-stream">
          <Parameter name="prompt" value="${escapeXml(data.prompt || "")}" />
          <Parameter name="first_message" value="${escapeXml(
            data.first_message || ""
          )}" />
        </Stream>
      </Connect>
    </Response>`;

  res.type("text/xml").send(twimlResponse);
});

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/outbound-media-stream") {
    wss.handleUpgrade(req, socket, head, ws => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

wss.on("connection", async (ws, req) => {
  console.info("[Server] Twilio connected to outbound media stream");

  let streamSid = null;
  let callSid = null;
  let elevenLabsWs = null;
  let customParameters = null;

  ws.on("error", console.error);

  const setupElevenLabs = async () => {
    try {
      const signedUrl = await getSignedUrl();
      elevenLabsWs = new WebSocket(signedUrl);

      elevenLabsWs.on("open", () => {
        console.log("[ElevenLabs] Connected to Conversational AI");

        const initialConfig = {
          type: "conversation_initiation_client_data",
          conversation_config_override: {
            agent: {
              prompt: {
                prompt:
                  customParameters?.prompt ||
                  "you are gary from the phone store",
              },
              first_message:
                customParameters?.first_message ||
                "hey there! how can I help you today?",
            },
          },
        };

        console.log(
          "[ElevenLabs] Sending initial config with prompt:",
          initialConfig.conversation_config_override.agent.prompt.prompt
        );

        elevenLabsWs.send(JSON.stringify(initialConfig));
      });

      elevenLabsWs.on("message", data => {
        try {
          const message = JSON.parse(data);

          switch (message.type) {
            case "conversation_initiation_metadata":
              console.log("[ElevenLabs] Received initiation metadata");
              break;

            case "audio":
              if (streamSid) {
                const chunk =
                  message.audio?.chunk || message.audio_event?.audio_base_64;
                if (chunk) {
                  ws.send(
                    JSON.stringify({
                      event: "media",
                      streamSid,
                      media: { payload: chunk },
                    })
                  );
                }
              }
              break;

            case "interruption":
              if (streamSid) {
                ws.send(JSON.stringify({ event: "clear", streamSid }));
              }
              break;

            case "ping":
              if (message.ping_event?.event_id) {
                elevenLabsWs.send(
                  JSON.stringify({
                    type: "pong",
                    event_id: message.ping_event.event_id,
                  })
                );
              }
              break;

            case "agent_response":
              const agentResponse =
                message.agent_response_event?.agent_response;
              console.log(`[Twilio] Agent response: ${agentResponse}`);
              if (callSid) {
                const current = transcriptStore.get(callSid) || "";
                transcriptStore.set(
                  callSid,
                  current + `Screening Agent: ${agentResponse}\n`
                );
              }
              break;

            case "user_transcript":
              const userTranscript =
                message.user_transcription_event?.user_transcript;
              console.log(`[Twilio] User transcript: ${userTranscript}`);
              if (callSid) {
                const current = transcriptStore.get(callSid) || "";
                transcriptStore.set(
                  callSid,
                  current + `Applicant: ${userTranscript}\n`
                );
              }
              break;

            default:
              console.log(
                `[ElevenLabs] Unhandled message type: ${message.type}`
              );
          }
        } catch (error) {
          console.error("[ElevenLabs] Error processing message:", error);
        }
      });

      elevenLabsWs.on("error", async error => {
        console.error("[ElevenLabs] WebSocket error:", error);
        if (callSid) {
          try {
            await twilioClient.calls(callSid).update({ status: "completed" });
            console.log(
              `[Twilio] Call ${callSid} ended due to ElevenLabs error`
            );
          } catch (err) {
            console.error(
              `[Twilio] Failed to end call ${callSid}:`,
              err.message
            );
          }
        }

        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      });

      elevenLabsWs.on("close", async () => {
        console.log("[ElevenLabs] Disconnected");

        if (callSid) {
          try {
            await twilioClient.calls(callSid).update({ status: "completed" });
            console.log(
              `[Twilio] Call ${callSid} ended due to ElevenLabs disconnect`
            );
          } catch (err) {
            console.error(
              `[Twilio] Failed to end call ${callSid}:`,
              err.message
            );
          }
        }

        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      });
    } catch (error) {
      console.error("[ElevenLabs] Setup error:", error);
    }
  };

  setupElevenLabs();

  ws.on("message", message => {
    try {
      const msg = JSON.parse(message);
      if (msg.event !== "media") {
        console.log(`[Twilio] Received event: ${msg.event}`);
      }

      switch (msg.event) {
        case "start":
          streamSid = msg.start.streamSid;
          callSid = msg.start.callSid;
          customParameters = msg.start.customParameters;
          console.log(
            `[Twilio] Stream started - StreamSid: ${streamSid}, CallSid: ${callSid}`
          );
          transcriptStore.set(callSid, "");
          break;

        case "media":
          if (elevenLabsWs?.readyState === WebSocket.OPEN) {
            const audioMessage = {
              user_audio_chunk: Buffer.from(
                msg.media.payload,
                "base64"
              ).toString("base64"),
            };
            elevenLabsWs.send(JSON.stringify(audioMessage));
          }
          break;

        case "stop":
          console.log(`[Twilio] Stream ${streamSid} ended`);
          if (elevenLabsWs?.readyState === WebSocket.OPEN) {
            elevenLabsWs.close();
          }
          break;

        default:
          console.log(`[Twilio] Unhandled event: ${msg.event}`);
      }
    } catch (error) {
      console.error("[Twilio] Error processing message:", error);
    }
  });

  ws.on("close", async () => {
    console.log("[Twilio] Client disconnected");

    // if (callSid && transcriptStore.has(callSid)) {
    //   const transcript = transcriptStore.get(callSid);
    //   console.log(`[Transcript for CallSid ${callSid}]\n${transcript}`);

    //   transcriptStore.delete(callSid);

    //   //save transcript to recruitment_job_applicants
    //   await updateOne(
    //     "recruitment_job_applicants",
    //     { ai_shortlisting_caller_id: callSid },
    //     {
    //       ai_shortlisting_data: { call_transcript: transcript },
    //       ai_shortlisting_status: 3,
    //       ai_shortlisting_timestamp: new Date(),
    //     }
    //   );

    //   setTimeout(async () => {
    //     await makePostRequest(
    //       "https://rec5.qa.darwinbox.io/recruitment/JobDetails/AIShortlistingEvaluation",
    //       {
    //         caller_id: callSid,
    //         pbqBeYWPUn:
    //           "dng3ZDJTQzQ4NjR1MDRoa0RfTFFlYzVzRVNMNzRSVVDQskprFUsFPOuy8EhrapcPcpbSU2VeNvTUCpGrAJdANA",
    //       },
    //       callSid
    //     );
    //   }, 1000);

    //   //initiate webhook
    // }

    if (elevenLabsWs?.readyState === WebSocket.OPEN) {
      elevenLabsWs.close();
    }
  });
});
