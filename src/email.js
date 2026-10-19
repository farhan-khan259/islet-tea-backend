import nodemailer from "nodemailer";
import { product } from "./catalog.js";

const deliveryNames = {
  home: "Cash on Delivery",
  "seven-eleven": "7-ELEVEN Pickup",
  familymart: "FamilyMart Pickup",
};

function display(value) {
  return value === undefined || value === null || value === ""
    ? "—"
    : String(value);
}

function escapeHtml(value) {
  return display(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildOrderEmail(
  order,
  timeZone = process.env.ORDER_EMAIL_TIMEZONE || "Asia/Karachi",
) {
  const packageDetails = product.packages.find(
    (item) => item.id === order.packageId,
  );
  const orderDate = new Date(order.createdAt).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "long",
    timeZone,
  });
  const rows = [
    ["Order number", order.orderNumber],
    ["Order date", orderDate],
    ["Status", order.status],
    ["Customer name", order.name],
    ["Phone", order.phone],
    ["Country / Region", order.country],
    ["City / County", order.city],
    ["District", order.district],
    ["Address", order.address],
    [
      "Delivery method",
      deliveryNames[order.deliveryMethod] || order.deliveryMethod,
    ],
    ["Pickup store", order.store],
    ["Product", product.title],
    ["Package", packageDetails?.label || order.packageId],
    ["Jars", order.jars],
    ["Total", `${display(order.currency)} ${display(order.total)}`],
    ["Payment method", order.paymentMethod],
    ["Notes", order.notes],
  ];
  const text = [
    `New order: ${display(order.orderNumber)}`,
    "",
    ...rows.map(([label, value]) => `${label}: ${display(value)}`),
  ].join("\n");
  const htmlRows = rows
    .map(
      ([label, value]) =>
        `<tr><th style="padding:8px 12px;text-align:left;vertical-align:top;background:#f3f6f4;border:1px solid #dfe7e2">${escapeHtml(label)}</th><td style="padding:8px 12px;border:1px solid #dfe7e2;white-space:pre-wrap">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  return {
    subject: `New Islet Tea order ${display(order.orderNumber)} — ${display(order.name)}`,
    text,
    html: `<div style="font-family:Arial,sans-serif;color:#1e3127"><h2>New Islet Tea order</h2><table style="border-collapse:collapse;width:100%;max-width:760px">${htmlRows}</table></div>`,
  };
}

export function createOrderEmailSender(env = process.env) {
  const required = ["SMTP_HOST", "ORDER_EMAIL_FROM", "ORDER_EMAIL_TO"];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    console.warn(
      `Order email disabled. Missing configuration: ${missing.join(", ")}`,
    );
    return undefined;
  }
  const port = Number(env.SMTP_PORT) || 587;
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: env.SMTP_SECURE === "true" || port === 465,
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return async (order) => {
    const message = buildOrderEmail(
      order,
      env.ORDER_EMAIL_TIMEZONE || "Asia/Karachi",
    );
    await transporter.sendMail({
      from: env.ORDER_EMAIL_FROM,
      to: env.ORDER_EMAIL_TO,
      ...message,
    });
  };
}
