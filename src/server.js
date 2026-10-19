import "dotenv/config";
import { MongoClient } from "mongodb";
import { createApp } from "./app.js";
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.ADMIN_API_KEY || process.env.ADMIN_API_KEY.length < 32)
) {
  console.error(
    "Set ADMIN_API_KEY to a random secret of at least 32 characters.",
  );
  process.exit(1);
}
const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "islet_tea");
  const orders = db.collection("orders");
  await orders.createIndex({ idempotencyKey: 1 }, { unique: true });
  await orders.createIndex({ orderNumber: 1 }, { unique: true });
  await orders.createIndex({ createdAt: -1 });
  const server = createApp({ orders }).listen(
    Number(process.env.PORT) || 4000,
    () =>
      console.log(
        "Islet Tea server listening on port " + (process.env.PORT || 4000),
      ),
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () =>
      server.close(async () => {
        await client.close();
        process.exit(0);
      }),
    );
} catch (e) {
  console.error(
    "Cannot connect to MongoDB. Check MONGODB_URI and start your database. " +
      e.message,
  );
  process.exit(1);
}
