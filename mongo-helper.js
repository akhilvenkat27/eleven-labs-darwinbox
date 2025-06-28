import { MongoClient } from "mongodb";

const url = "";

const dbName = "";

export async function updateOne(collectionName, filter, update) {
  try {
    const client = new MongoClient(url, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    await client.connect();

    const db = client.db(dbName);

    const collection = db.collection(collectionName);

    const result = await collection.updateOne(filter, { $set: update });

    await client.close();

    console.log("Document updated successfully");

    return result;
  } catch (error) {
    console.error("Error in updateOne:", error);

    return;
  }
}
