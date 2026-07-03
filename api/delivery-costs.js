import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

// ---------------------------------------------------------------------------
// Delivery-cost automation — processing endpoint.
//
// HARD CONSTRAINT: no uploaded delivery / customer data is ever persisted.
// The uploaded file is decoded, parsed, priced and turned into per-pharmacy
// output files entirely in memory, for the duration of this single request.
// Nothing is written to Supabase, disk, logs, or any cache. The only Supabase
// read here is the (non-customer) pharmacy pricing configuration. All caches
// below are plain local variables that die with the request.
// ---------------------------------------------------------------------------

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// The uploaded file arrives base64-encoded in the JSON body. Vercel's default
// serverless request-body limit (~4.5 MB) accommodates the base64 of a typical
// dispatch export; very large exports may need to be split.

// --- Output sheet columns -------------------------------------------------
// The full column set (section 7). `Cost` is appended automatically and must
// not be listed here. Change this array to change every output sheet.
const OUTPUT_COLUMNS = [
  "Order_ID",
  "Task_Type",
  "Agent_Name",
  "Pick_up_From",
  "Customer_Name",
  "Customer_Address",
  "Customer_Phone",
  "Task_Status",
  "Completion_Time",
  "Latitude",
  "Longitude",
];
const COST_COLUMN = "Cost";

const EMPTY_TOKENS = new Set(["", "-", "0", "null", "n/a", "na"]);

function isEmptyToken(v) {
  return v === undefined || v === null || EMPTY_TOKENS.has(String(v).trim().toLowerCase());
}

export function hasAgent(row) {
  const id = row.Agent_ID;
  const name = row.Agent_Name;
  const idOk = !isEmptyToken(id);
  const nameOk = name !== undefined && name !== null && !EMPTY_TOKENS.has(String(name).trim().toLowerCase());
  return idOk || nameOk;
}

function parseNumber(v) {
  if (v === undefined || v === null || String(v).trim() === "" || String(v).trim() === "-") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

export function parseOrderId(v) {
  const n = parseNumber(v);
  return n === null ? null : Math.trunc(n);
}

// --- Pharmacy config validation (manual; Zod may replace this later) ------
function normalizeCityRates(raw) {
  const out = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      const key = String(k).trim().toLowerCase();
      const rate = typeof v === "string" ? Number(v) : v;
      if (key && typeof rate === "number" && Number.isFinite(rate)) out[key] = rate;
    }
  }
  return out;
}

// --- Pharmacy matching (section 3) ----------------------------------------
export function matchPharmacy(pharmacies, orderId) {
  if (orderId !== null) {
    const match = pharmacies.find((p) => p.order_id === orderId);
    if (match) return { pharmacy: match, source: "order_id" };
  }
  return { pharmacy: null, source: "unmatched" };
}

// --- City resolution (section 6) ------------------------------------------
const PROVINCE_PATTERN =
  /^(Ontario|ON|Quebec|QC|British Columbia|BC|Alberta|AB|Manitoba|MB|Saskatchewan|SK|Nova Scotia|NS|New Brunswick|NB|Newfoundland(?: and Labrador)?|NL|Prince Edward Island|PE|Northwest Territories|NT|Yukon|YT|Nunavut|NU)\b/i;

export function parseCityFromAddress(address) {
  if (!address) return null;
  const tokens = String(address).split(",").map((t) => t.trim()).filter(Boolean);
  const provinceIndex = tokens.findIndex((t) => PROVINCE_PATTERN.test(t));
  if (provinceIndex <= 0) return null;
  const candidate = tokens[provinceIndex - 1];
  if (!candidate || /^\d+\s/.test(candidate)) return null; // guards against picking up a street
  return candidate;
}

async function reverseGeocodeCity(lat, lng, key, cache, fetchImpl = fetch) {
  if (lat === null || lng === null || !key) return null;
  const ck = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (cache.has(ck)) return cache.get(ck);
  let city = null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`;
    const res = await fetchImpl(url);
    const data = await res.json();
    if (data.status === "OK" && data.results?.length) {
      const components = data.results[0].address_components || [];
      city =
        components.find((c) => c.types.includes("locality"))?.long_name ??
        components.find((c) => c.types.includes("postal_town"))?.long_name ??
        components.find((c) => c.types.includes("administrative_area_level_2"))?.long_name ??
        null;
    }
  } catch {
    city = null;
  }
  cache.set(ck, city);
  return city;
}

async function drivingDistanceKm(origin, destLat, destLng, key, cache, fetchImpl = fetch) {
  if (destLat === null || destLng === null || !key) return null;
  const ck = `${origin.id}|${destLat.toFixed(4)},${destLng.toFixed(4)}`;
  if (cache.has(ck)) return cache.get(ck);
  let km = null;
  try {
    const url =
      `https://maps.googleapis.com/maps/api/distancematrix/json` +
      `?origins=${origin.latitude},${origin.longitude}` +
      `&destinations=${destLat},${destLng}` +
      `&mode=driving&units=metric&key=${key}`;
    const res = await fetchImpl(url);
    const data = await res.json();
    const el = data.status === "OK" ? data.rows?.[0]?.elements?.[0] : null;
    if (el && el.status === "OK" && el.distance) km = el.distance.value / 1000;
  } catch {
    km = null;
  }
  cache.set(ck, km);
  return km;
}

// --- Cost calculation (section 5) -----------------------------------------
// Returns { cost: number|null, resolved: boolean, reason?: string }.
async function calculateCost(row, pharmacy, apiKey, caches, fetchImpl = fetch) {
  const address = row.Customer_Address;
  const lat = parseNumber(row.Latitude);
  const lng = parseNumber(row.Longitude);

  // 1. Resolve city (parse, then reverse-geocode fallback).
  let city = parseCityFromAddress(address);
  if (!city) city = await reverseGeocodeCity(lat, lng, apiKey, caches.geocode, fetchImpl);

  // 2. City flat rate.
  if (city) {
    const rate = pharmacy.city_rates[city.trim().toLowerCase()];
    if (rate !== undefined) return { cost: round2(rate), resolved: true };
  }

  // 3. Distance Matrix fallback → distance * per_km_rate.
  const km = await drivingDistanceKm(pharmacy, lat, lng, apiKey, caches.distance, fetchImpl);
  if (km !== null) return { cost: round2(km * pharmacy.per_km_rate), resolved: true };

  // 4. Neither worked.
  return {
    cost: null,
    resolved: false,
    reason: !city && !apiKey ? "no city + no API key" : "city + distance unresolved",
  };
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function projectRow(row, cost) {
  const out = {};
  for (const col of OUTPUT_COLUMNS) out[col] = row[col] ?? "";
  out[COST_COLUMN] = cost === null || cost === undefined ? "" : cost;
  return out;
}

// --- Simple admin gate (activates only when ADMIN_ACCESS_KEY is set) -------
function adminAllowed(req) {
  const required = process.env.ADMIN_ACCESS_KEY;
  if (!required) return true; // not configured → non-breaking (flagged in UI)
  const provided = req.headers["x-admin-key"] || req.query.admin_key;
  return provided === required;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!adminAllowed(req)) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { fileBase64, format } = req.body || {};
    if (!fileBase64) return res.status(400).json({ error: "No file provided" });
    const fmt = format === "xlsx" ? "xlsx" : "csv";

    const apiKey = process.env.GOOGLE_MAPS_API_KEY || null;

    // Load pharmacy pricing config (active only). No customer data involved.
    const { data: rawPharmacies, error: dbErr } = await supabase
      .from("pharmacies")
      .select("*")
      .eq("is_active", true);
    if (dbErr) return res.status(500).json({ error: "Failed to load pharmacy config" });

    const pharmacies = (rawPharmacies || []).map((p) => ({
      ...p,
      order_id: Number(p.order_id),
      latitude: Number(p.latitude),
      longitude: Number(p.longitude),
      per_km_rate: Number(p.per_km_rate),
      city_rates: normalizeCityRates(p.city_rates),
    }));

    // Parse the uploaded file in memory.
    const buf = Buffer.from(fileBase64, "base64");
    let rows;
    try {
      const wb = XLSX.read(buf, { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
    } catch {
      return res.status(400).json({ error: "Could not parse file. Expected CSV or XLSX." });
    }

    const { buckets, summary } = await processRows(rows, pharmacies, apiKey);
    const files = buildFiles(buckets, summary, fmt);

    return res.status(200).json({ summary, files });
  } catch (err) {
    console.error("delivery-costs handler error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

const KNOWN_AGENT_CHECK = new Set(["cancelled", "unassigned", "assigned"]);

// Apply inclusion rules (section 4), match by Order_ID (section 3), and price
// Delivery rows (section 5). Pure aside from optional Google API calls in
// calculateCost. Returns { buckets, summary }. Caches live only for this call.
// `fetchImpl` is injectable so the pipeline can be tested without the network.
export async function processRows(rows, pharmacies, apiKey, fetchImpl = fetch) {
  const caches = { geocode: new Map(), distance: new Map() };
  const buckets = new Map(); // pharmacyId -> { pharmacy, rows: [] }
  const summary = {
    totalRows: rows.length,
    kept: 0,
    discarded: { total: 0, noAgent: 0, unrecognizedStatus: 0 },
    unmatched: { count: 0, orderIds: {} },
    unresolvedCost: { count: 0, sample: [] },
    perPharmacy: [],
    warnings: [],
  };
  if (!apiKey) {
    summary.warnings.push(
      "GOOGLE_MAPS_API_KEY is not set — rows needing distance/geocoding could not be priced."
    );
  }

  for (const row of rows) {
    const statusKey = String(row.Task_Status ?? "").trim().toLowerCase();

    // --- Row inclusion rules (section 4) ---
    let keep;
    if (statusKey === "completed") {
      keep = true;
    } else if (KNOWN_AGENT_CHECK.has(statusKey)) {
      keep = hasAgent(row);
      if (!keep) summary.discarded.noAgent++;
    } else {
      // Unrecognized / blank status → discard, surfaced in summary.
      keep = false;
      summary.discarded.unrecognizedStatus++;
    }
    if (!keep) {
      summary.discarded.total++;
      continue;
    }

    // --- Match to pharmacy by Order_ID only (section 3) ---
    const orderId = parseOrderId(row.Order_ID);
    const { pharmacy } = matchPharmacy(pharmacies, orderId);
    if (!pharmacy) {
      summary.unmatched.count++;
      const k = orderId === null ? "(blank)" : String(orderId);
      summary.unmatched.orderIds[k] = (summary.unmatched.orderIds[k] || 0) + 1;
      continue;
    }

    summary.kept++;
    if (!buckets.has(pharmacy.id)) buckets.set(pharmacy.id, { pharmacy, rows: [] });
    const bucket = buckets.get(pharmacy.id);

    // --- Cost (section 5): only Delivery rows are priced ---
    let cost = null;
    const isDelivery = String(row.Task_Type ?? "").trim().toLowerCase() === "delivery";
    if (isDelivery) {
      const result = await calculateCost(row, pharmacy, apiKey, caches, fetchImpl);
      cost = result.cost;
      if (!result.resolved) {
        summary.unresolvedCost.count++;
        if (summary.unresolvedCost.sample.length < 10) {
          summary.unresolvedCost.sample.push({
            pharmacy: pharmacy.name,
            order_id: pharmacy.order_id,
            address: row.Customer_Address,
            reason: result.reason,
          });
        }
      }
    }

    bucket.rows.push(projectRow(row, cost));
  }

  return { buckets, summary };
}

// Build one output file per pharmacy, entirely in memory. Mutates summary
// with the per-pharmacy breakdown. Returns [{ filename, mimeType, base64, … }].
export function buildFiles(buckets, summary, fmt) {
  const files = [];
  for (const { pharmacy, rows: outRows } of buckets.values()) {
    const ws = XLSX.utils.json_to_sheet(outRows, {
      header: [...OUTPUT_COLUMNS, COST_COLUMN],
    });
    let base64, mimeType;
    if (fmt === "xlsx") {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Deliveries");
      base64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    } else {
      const csv = XLSX.utils.sheet_to_csv(ws);
      base64 = Buffer.from(csv, "utf-8").toString("base64");
      mimeType = "text/csv";
    }

    const deliveries = outRows.filter(
      (r) => String(r.Task_Type).trim().toLowerCase() === "delivery"
    ).length;

    files.push({
      filename: `${pharmacy.file_name}.${fmt}`,
      mimeType,
      base64,
      rows: outRows.length,
      deliveries,
      pickups: outRows.length - deliveries,
    });

    summary.perPharmacy.push({
      name: pharmacy.name,
      order_id: pharmacy.order_id,
      file_name: `${pharmacy.file_name}.${fmt}`,
      rows: outRows.length,
      deliveries,
      pickups: outRows.length - deliveries,
    });
  }

  summary.perPharmacy.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.filename.localeCompare(b.filename));
  return files;
}
