import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Only pharmacy pricing configuration lives in Supabase — never any uploaded
// delivery / customer data. This endpoint is the admin CRUD for that config.

const FIELDS = [
  "name",
  "file_name",
  "order_id",
  "address",
  "city",
  "latitude",
  "longitude",
  "city_rates",
  "per_km_rate",
  "is_active",
];

// Lightweight, dependency-free validation of the request body. (Zod may be
// added later; for now we validate by hand to match the existing plain-JS
// handlers.) Returns { value } on success or { error } on failure.
function validatePharmacy(body, { partial = false } = {}) {
  const out = {};

  const requireString = (key) => {
    const v = body[key];
    if (typeof v !== "string" || v.trim() === "")
      return `"${key}" is required and must be a non-empty string`;
    out[key] = v.trim();
    return null;
  };

  const requireNumber = (key, { integer = false } = {}) => {
    const v = body[key];
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n !== "number" || !Number.isFinite(n))
      return `"${key}" is required and must be a number`;
    if (integer && !Number.isInteger(n))
      return `"${key}" must be an integer`;
    out[key] = n;
    return null;
  };

  // city_rates: object of { [normalized city name]: number }
  const validateCityRates = () => {
    const v = body.city_rates;
    if (v === undefined || v === null) {
      out.city_rates = {};
      return null;
    }
    if (typeof v !== "object" || Array.isArray(v))
      return `"city_rates" must be an object of { city: rate }`;
    const normalized = {};
    for (const [rawKey, rawVal] of Object.entries(v)) {
      const key = String(rawKey).trim().toLowerCase();
      if (!key) return `"city_rates" contains an empty city name`;
      const rate = typeof rawVal === "string" ? Number(rawVal) : rawVal;
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0)
        return `"city_rates" rate for "${rawKey}" must be a non-negative number`;
      normalized[key] = rate;
    }
    out.city_rates = normalized;
    return null;
  };

  const checks = {
    name: () => requireString("name"),
    file_name: () => requireString("file_name"),
    order_id: () => requireNumber("order_id", { integer: true }),
    address: () => requireString("address"),
    city: () => requireString("city"),
    latitude: () => requireNumber("latitude"),
    longitude: () => requireNumber("longitude"),
    city_rates: validateCityRates,
    per_km_rate: () => requireNumber("per_km_rate"),
    is_active: () => {
      if (body.is_active === undefined) return null;
      out.is_active = Boolean(body.is_active);
      return null;
    },
  };

  for (const key of FIELDS) {
    const present = body[key] !== undefined;
    // On partial (PATCH-style) updates only validate provided fields.
    if (partial && !present && key !== "is_active") continue;
    const err = checks[key]();
    if (err) return { error: err };
  }

  // City home rate convenience: ensure the home city is normalized into
  // city_rates is left to the admin UI; we don't force it here.
  return { value: out };
}

export default async function handler(req, res) {
  try {
    switch (req.method) {
      case "GET": {
        const { id } = req.query;
        if (id) {
          const { data, error } = await supabase
            .from("pharmacies")
            .select("*")
            .eq("id", id)
            .single();
          if (error) return res.status(404).json({ error: "Pharmacy not found" });
          return res.status(200).json({ pharmacy: data });
        }
        const { data, error } = await supabase
          .from("pharmacies")
          .select("*")
          .order("name", { ascending: true });
        if (error) return res.status(500).json({ error: "Failed to load pharmacies" });
        return res.status(200).json({ pharmacies: data });
      }

      case "POST": {
        const { error: vErr, value } = validatePharmacy(req.body || {});
        if (vErr) return res.status(400).json({ error: vErr });

        const { data, error } = await supabase
          .from("pharmacies")
          .insert([value])
          .select()
          .single();
        if (error) {
          if (error.code === "23505")
            return res.status(409).json({
              error: "A pharmacy with this file_name or order_id already exists",
            });
          return res.status(500).json({ error: "Failed to create pharmacy" });
        }
        return res.status(201).json({ pharmacy: data });
      }

      case "PUT":
      case "PATCH": {
        const id = req.query.id || (req.body && req.body.id);
        if (!id) return res.status(400).json({ error: "Missing pharmacy id" });

        const { error: vErr, value } = validatePharmacy(req.body || {}, {
          partial: true,
        });
        if (vErr) return res.status(400).json({ error: vErr });
        delete value.id;

        const { data, error } = await supabase
          .from("pharmacies")
          .update(value)
          .eq("id", id)
          .select()
          .single();
        if (error) {
          if (error.code === "23505")
            return res.status(409).json({
              error: "A pharmacy with this file_name or order_id already exists",
            });
          return res.status(500).json({ error: "Failed to update pharmacy" });
        }
        if (!data) return res.status(404).json({ error: "Pharmacy not found" });
        return res.status(200).json({ pharmacy: data });
      }

      case "DELETE": {
        const id = req.query.id || (req.body && req.body.id);
        if (!id) return res.status(400).json({ error: "Missing pharmacy id" });
        const { error } = await supabase.from("pharmacies").delete().eq("id", id);
        if (error) return res.status(500).json({ error: "Failed to delete pharmacy" });
        return res.status(200).json({ success: true });
      }

      default:
        res.setHeader("Allow", "GET, POST, PUT, PATCH, DELETE");
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (err) {
    console.error("pharmacies handler error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
