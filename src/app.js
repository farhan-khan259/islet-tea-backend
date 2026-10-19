import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { product } from "./catalog.js";
import { validateOrder } from "./validation.js";
export function createApp({
  orders,
  allowedOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  adminKey = process.env.ADMIN_API_KEY,
} = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          mediaSrc: ["'self'", "https:"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests:
            process.env.NODE_ENV === "production" ? [] : null,
        },
      },
    }),
  );
  app.use(cors({ origin: allowedOrigin }));
  app.use(express.json({ limit: "16kb" }));
  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", database: orders ? "connected" : "unavailable" }),
  );
  app.get("/api/products/:id", (req, res) =>
    req.params.id === product.id
      ? res.json(product)
      : res.status(404).json({ message: "Product not found" }),
  );
  app.post(
    "/api/orders",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 20,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { message: "Too many orders. Please try again later." },
    }),
    async (req, res, next) => {
      try {
        const { errors, value } = validateOrder(req.body || {});
        if (errors.length)
          return res
            .status(400)
            .json({
              message: "Please check the required order details.",
              fields: errors,
            });
        if (!orders)
          return res
            .status(503)
            .json({
              message:
                "Ordering is temporarily unavailable. Please try again later.",
            });
        const idempotencyKey = req.get("Idempotency-Key");
        if (!idempotencyKey || !/^[a-zA-Z0-9-]{16,80}$/.test(idempotencyKey))
          return res
            .status(400)
            .json({ message: "A valid Idempotency-Key header is required." });
        const publicOrder = (o) => ({
          orderNumber: o.orderNumber,
          total: o.total,
          currency: o.currency,
          status: o.status,
        });
        const existing = await orders.findOne({ idempotencyKey });
        if (existing) {
          const fields = [
            "name",
            "phone",
            "country",
            "city",
            "district",
            "address",
            "deliveryMethod",
            "store",
            "notes",
            "packageId",
          ];
          if (fields.some((k) => existing[k] !== value[k]))
            return res
              .status(409)
              .json({
                message:
                  "This request key was already used for different order details. Reload before placing another order.",
              });
          return res.json(publicOrder(existing));
        }
        const order = {
          ...value,
          idempotencyKey,
          orderNumber:
            "IFT-" +
            Date.now().toString(36).toUpperCase() +
            "-" +
            randomBytes(3).toString("hex").toUpperCase(),
        };
        try {
          await orders.insertOne(order);
        } catch (e) {
          if (e.code === 11000) {
            const saved = await orders.findOne({ idempotencyKey });
            if (saved) return res.json(publicOrder(saved));
          }
          throw e;
        }
        return res.status(201).json(publicOrder(order));
      } catch (e) {
        next(e);
      }
    },
  );
  app.get("/api/admin/orders", async (req, res, next) => {
    try {
      const supplied = req.get("X-Admin-Key") || "";
      const a = Buffer.from(supplied),
        b = Buffer.from(adminKey || "");
      if (!adminKey || a.length !== b.length || !timingSafeEqual(a, b))
        return res.status(401).json({ message: "Unauthorized" });
      if (!orders)
        return res.status(503).json({ message: "Database unavailable" });
      const page = Math.max(1, Math.min(100000, parseInt(req.query.page) || 1));
      res.json({
        page,
        orders: await orders
          .find({}, { projection: { idempotencyKey: 0 } })
          .sort({ createdAt: -1 })
          .skip((page - 1) * 50)
          .limit(50)
          .toArray(),
      });
    } catch (e) {
      next(e);
    }
  });
  const dist = fileURLToPath(new URL("../../frontend/dist/", import.meta.url));
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get(["/", "/product.html"], (_req, res) =>
      res.sendFile(path.join(dist, "index.html")),
    );
  }
  app.use("/api", (_req, res) =>
    res.status(404).json({ message: "API route not found" }),
  );
  app.use((err, _req, res, _next) => {
    if (err.type === "entity.parse.failed")
      return res.status(400).json({ message: "Invalid JSON" });
    if (err.type === "entity.too.large")
      return res.status(413).json({ message: "Request is too large" });
    console.error("Request failed:", err.name);
    res
      .status(500)
      .json({ message: "Unable to process your request. Please try again." });
  });
  return app;
}
