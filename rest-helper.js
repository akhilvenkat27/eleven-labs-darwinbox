import axios from "axios";

export async function makePostRequest(url, data, callSid) {
  try {
    console.log("Initiated Web Hook: ", callSid);

    const response = await axios.post(url, data, {
      headers: {
        "Content-Type": "application/json",
        Cookie:
          "G_ENABLED_IDPS=google; pbqBeYWPUn=dng3ZDJTQzQ4NjR1MDRoa0RfTFFlYzVzRVNMNzRSVVDQskprFUsFPOuy8EhrapcPcpbSU2VeNvTUCpGrAJdANA%3D%3D; session=7db4c645fa4b3d1681d4bb1b3f4235ae; ab805d4a680a53f51e16ffb2737d0dc5=f0bf00bcd45cdb9c0170bdee629e642f65460017a%3A4%3A%7Bi%3A0%3Bs%3A6%3A%22760241%22%3Bi%3A1%3Bs%3A4%3A%22REC5%22%3Bi%3A2%3Bi%3A604800%3Bi%3A3%3Ba%3A16%3A%7Bs%3A18%3A%22userSessionTimeout%22%3Bi%3A1744960661%3Bs%3A9%3A%22plan_name%22%3Bs%3A0%3A%22%22%3Bs%3A9%3A%22tenant_id%22%3Bs%3A3%3A%22191%22%3Bs%3A13%3A%22monthly_spend%22%3Bi%3A0%3Bs%3A14%3A%22account_status%22%3Bi%3A2%3Bs%3A7%3A%22is_paid%22%3Bi%3A0%3Bs%3A15%3A%22financial_cycle%22%3Bs%3A1%3A%221%22%3Bs%3A26%3A%22no_of_employees_on_payment%22%3Bi%3A0%3Bs%3A18%3A%22account_created_on%22%3Bi%3A1676468335%3Bs%3A31%3A%22changed_from_trial_to_active_on%22%3Bi%3A0%3Bs%3A12%3A%22mod_is_leave%22%3Bi%3A1%3Bs%3A17%3A%22mod_is_attendance%22%3Bi%3A1%3Bs%3A13%3A%22mod_is_stream%22%3Bi%3A1%3Bs%3A20%3A%22mod_is_reimbursement%22%3Bi%3A1%3Bs%3A14%3A%22mod_is_payroll%22%3Bi%3A1%3Bs%3A9%3A%22expire_on%22%3Bi%3A2281199400%3B%7D%7D",
      },
    });

    console.log("Web Hook Response completed");

    return response.data;
  } catch (error) {
    console.error("Error making POST request:", error);
    throw error;
  }
}

// (async () => {
//   console.log(
//     await makePostRequest(
//       "https://rec5.qa.darwinbox.io/recruitment/JobDetails/AIShortlistingEvaluation",
//       {
//         caller_id: "CA8bd4d374f0e7c1832b662185d969c9f3",
//         pbqBeYWPUn:
//           "dng3ZDJTQzQ4NjR1MDRoa0RfTFFlYzVzRVNMNzRSVVDQskprFUsFPOuy8EhrapcPcpbSU2VeNvTUCpGrAJdANA",
//       }
//     )
//   );
// })();
