import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "./app.js";
const body = {
  name: "Test Customer",
  phone: "0912345678",
  country: "Taiwan",
  city: "Taipei City",
  district: "Zhongzheng",
  address: "123 Example Street",
  deliveryMethod: "home",
  packageId: "six",
  notes: "",
};
function memoryOrders() {
  const docs = [];
  return {
    docs,
    async findOne(q) {
      return docs.find((o) => o.idempotencyKey === q.idempotencyKey);
    },
    async insertOne(o) {
      docs.push(o);
      return { insertedId: "test" };
    },
    find() {
      return {
        sort() {
          return this;
        },
        skip() {
          return this;
        },
        limit() {
          return this;
        },
        async toArray() {
          return docs;
        },
      };
    },
  };
}
test("order total comes from catalog and duplicate request does not insert twice", async () => {
  const orders = memoryOrders(),
    app = createApp({ orders });
  const first = await request(app)
    .post("/api/orders")
    .set("Idempotency-Key", "12345678-1234-4321-1234-123456789012")
    .send({ ...body, total: 1 });
  assert.equal(first.status, 201);
  assert.equal(first.body.total, 1450);
  assert.equal(orders.docs.length, 1);
  const retry = await request(app)
    .post("/api/orders")
    .set("Idempotency-Key", "12345678-1234-4321-1234-123456789012")
    .send(body);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.orderNumber, first.body.orderNumber);
  assert.equal(orders.docs.length, 1);
  assert.equal(first.body.phone, undefined);
});
test("same request key with changed customer is rejected", async () => {
  const app = createApp({ orders: memoryOrders() });
  const key = "12345678-1234-4321-1234-123456789013";
  await request(app).post("/api/orders").set("Idempotency-Key", key).send(body);
  const r = await request(app)
    .post("/api/orders")
    .set("Idempotency-Key", key)
    .send({ ...body, name: "Other Customer" });
  assert.equal(r.status, 409);
});
test("invalid package and missing fields are rejected", async () => {
  const r = await request(createApp({ orders: memoryOrders() }))
    .post("/api/orders")
    .send({ packageId: "fake" });
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.includes("packageId"));
  assert.ok(r.body.fields.includes("name"));
  assert.ok(r.body.fields.includes("country"));
});
test("international country and city names are accepted", async () => {
  const r = await request(createApp({ orders: memoryOrders() }))
    .post("/api/orders")
    .set("Idempotency-Key", "12345678-1234-4321-1234-123456789099")
    .send({
      ...body,
      country: "United Arab Emirates",
      city: "Abu Dhabi",
      district: "Al Zahiyah",
    });
  assert.equal(r.status, 201);
});
test("pickup requires store details", async () => {
  const r = await request(createApp({ orders: memoryOrders() }))
    .post("/api/orders")
    .send({ ...body, deliveryMethod: "familymart" });
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.includes("store"));
});
test("database unavailable does not report successful order", async () => {
  const r = await request(createApp()).post("/api/orders").send(body);
  assert.equal(r.status, 503);
});
test("admin endpoint requires secret and accepts configured key", async () => {
  const app = createApp({ orders: memoryOrders(), adminKey: "testing-secret" });
  assert.equal((await request(app).get("/api/admin/orders")).status, 401);
  assert.equal(
    (
      await request(app)
        .get("/api/admin/orders")
        .set("X-Admin-Key", "testing-secret")
    ).status,
    200,
  );
});
test("catalog and malformed JSON handling", async () => {
  const app = createApp();
  assert.equal((await request(app).get("/api/products/unknown")).status, 404);
  assert.equal(
    (await request(app).get("/api/products/organic-islet-fruit-tea")).body
      .packages.length,
    5,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/orders")
        .set("Content-Type", "application/json")
        .send("{")
    ).status,
    400,
  );
});
