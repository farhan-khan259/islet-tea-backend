import { product } from "./catalog.js";
export function validateOrder(body) {
  const errors = [];
  const string = (key, min, max) => {
    const v = typeof body[key] === "string" ? body[key].trim() : "";
    if (v.length < min || v.length > max) errors.push(key);
    return v;
  };
  const name = string("name", 2, 100),
    phone = string("phone", 7, 30),
    country = string("country", 2, 100),
    city = string("city", 2, 100),
    district = string("district", 1, 100),
    address = string("address", 5, 300);
  if (
    !/^[+0-9() .-]{7,30}$/.test(phone) ||
    phone.replace(/\D/g, "").length < 7 ||
    phone.replace(/\D/g, "").length > 15
  )
    errors.push("phone");
  const deliveryMethod = body.deliveryMethod;
  if (!["home", "seven-eleven", "familymart"].includes(deliveryMethod))
    errors.push("deliveryMethod");
  const store = typeof body.store === "string" ? body.store.trim() : "";
  if (deliveryMethod !== "home" && (store.length < 2 || store.length > 150))
    errors.push("store");
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (notes.length > 1000) errors.push("notes");
  const pack = product.packages.find((p) => p.id === body.packageId);
  if (!pack) errors.push("packageId");
  if (body.website) errors.push("spam");
  return {
    errors: [...new Set(errors)],
    value: {
      name,
      phone,
      country,
      city,
      district,
      address,
      deliveryMethod,
      store: deliveryMethod === "home" ? "" : store,
      notes,
      productId: product.id,
      packageId: pack?.id,
      jars: pack?.jars,
      total: pack?.price,
      currency: "TWD",
      paymentMethod: "cash-on-delivery",
      status: "pending",
      createdAt: new Date(),
    },
  };
}
