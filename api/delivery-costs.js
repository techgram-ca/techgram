import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

// ---------------------------------------------------------------------------
// Delivery-cost automation — processing endpoint.
//
// HARD CONSTRAINT: no uploaded delivery / customer data is ever persisted.
// The uploaded file is decoded, parsed, priced and turned into per-pharmacy
// output files entirely in memory, for the duration of this single request.
// Nothing is written to Supabase, disk, logs, or any cache. The only Supabase
// read here is the (non-customer) pharmacy pricing configuration.
// ---------------------------------------------------------------------------

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// The uploaded file arrives base64-encoded in the JSON body. Vercel's default
// serverless request-body limit (~4.5 MB) accommodates the base64 of a typical
// dispatch export; very large exports may need to be split.

// --- Output sheet columns -------------------------------------------------
// The full column set. `Cost` is appended automatically and must not be listed
// here. Change this array to change every output sheet.
const OUTPUT_COLUMNS = [
  "Merge_ID",
  "Task_ID",
  "Order_ID",
  "Task_Type",
  "Agent_ID",
  "Agent_Name",
  "Pick_up_From",
  "Customer_Name",
  "Customer_Address",
  "Latitude",
  "Longitude",
  "Customer_Phone",
  "Complete_Before",
  "Completion_Time",
  "Task_Status",
];
const COST_COLUMN = "Cost";

// Placeholder written to the Cost cell for Delivery rows whose city has no flat
// rate in the pharmacy's city_rates. (Distance-based calculation is disabled
// for now — these are meant to be computed later.)
const NEEDS_CALC = "Need to Calculate";

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

// --- City resolution ------------------------------------------------------
const PROVINCE_PATTERN =
  /^(Ontario|ON|Quebec|QC|British Columbia|BC|Alberta|AB|Manitoba|MB|Saskatchewan|SK|Nova Scotia|NS|New Brunswick|NB|Newfoundland(?: and Labrador)?|NL|Prince Edward Island|PE|Northwest Territories|NT|Yukon|YT|Nunavut|NU)\b/i;

// Upper-tier regional municipalities / counties that dispatch addresses often
// insert between the city and the province, e.g.
// "1616 Haig Boulevard, Mississauga, Peel, Ontario, Canada". When one of these
// is the token before the province, the real city is one token further back.
const REGION_TOKENS = new Set([
  "peel", "york", "halton", "durham", "niagara", "waterloo",
  "simcoe", "muskoka", "golden horseshoe",
]);

function isRegionToken(t) {
  const s = t.trim().toLowerCase();
  return REGION_TOKENS.has(s) || /\bregion\b/.test(s) || /\bcounty\b/.test(s);
}

export function parseCityFromAddress(address) {
  if (!address) return null;
  const tokens = String(address).split(",").map((t) => t.trim()).filter(Boolean);
  const provinceIndex = tokens.findIndex((t) => PROVINCE_PATTERN.test(t));
  if (provinceIndex <= 0) return null;
  // Walk back from the province, skipping regional-municipality tokens, to reach
  // the actual city.
  let i = provinceIndex - 1;
  while (i >= 0 && isRegionToken(tokens[i])) i--;
  const candidate = tokens[i];
  if (!candidate || /^\d+\s/.test(candidate)) return null; // guards against picking up a street
  return candidate;
}

// --- Cost calculation -----------------------------------------------------
// Distance-based pricing is disabled for now: we only apply the pharmacy's
// city flat rates. A Delivery row whose city has no flat rate gets the
// `Need to Calculate` placeholder (to be priced later), never 0.
// Returns { cost: number|string, resolved: boolean, reason?: string }.
function calculateCost(row, pharmacy) {
  const city = parseCityFromAddress(row.Customer_Address);
  if (city) {
    const rate = pharmacy.city_rates[city.trim().toLowerCase()];
    if (rate !== undefined) return { cost: round2(rate), resolved: true };
  }
  return {
    cost: NEEDS_CALC,
    resolved: false,
    reason: city ? `no flat rate for "${city}"` : "city not resolved from address",
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

    const { buckets, summary } = processRows(rows, pharmacies);
    const files = buildFiles(buckets, summary, fmt);

    return res.status(200).json({ summary, files });
  } catch (err) {
    console.error("delivery-costs handler error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

const KNOWN_AGENT_CHECK = new Set(["cancelled", "unassigned", "assigned"]);

// Apply inclusion rules, match by Order_ID, and price Delivery rows via the
// pharmacy's city flat rates. Pure and synchronous. Returns { buckets, summary }.
export function processRows(rows, pharmacies) {
  const buckets = new Map(); // pharmacyId -> { pharmacy, rows: [] }
  const summary = {
    totalRows: rows.length,
    kept: 0,
    discarded: { total: 0, noAgent: 0, unrecognizedStatus: 0 },
    unmatched: { count: 0, orderIds: {} },
    needsCalculation: { count: 0, sample: [] },
    perPharmacy: [],
    warnings: [],
  };

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

    // --- Cost: only Delivery rows are priced (Pick-up stays blank) ---
    let cost = null;
    const isDelivery = String(row.Task_Type ?? "").trim().toLowerCase() === "delivery";
    if (isDelivery) {
      const result = calculateCost(row, pharmacy);
      cost = result.cost;
      if (!result.resolved) {
        summary.needsCalculation.count++;
        if (summary.needsCalculation.sample.length < 10) {
          summary.needsCalculation.sample.push({
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
