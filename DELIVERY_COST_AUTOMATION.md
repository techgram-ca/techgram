# Delivery-Cost Automation

Upload a dispatch export (CSV/XLSX), calculate a delivery cost per row from
pharmacy-specific pricing rules, and download one output sheet per pharmacy.

## Privacy constraint

Uploaded delivery/customer data is **never persisted** — no database, disk,
logs, or cache. The file is decoded, parsed, priced, and turned into
per-pharmacy output files entirely in memory for the duration of one request
(`api/delivery-costs.js`). The only thing stored in Supabase is pharmacy
pricing config (the `pharmacies` table) — no customer data.

## Pieces

| Path | What |
| --- | --- |
| `supabase/migrations/20260703000000_create_pharmacies.sql` | `pharmacies` pricing-config table (new; touches nothing else) |
| `api/pharmacies.js` | CRUD for pharmacy config (plain-JS Vercel function, Supabase service key) |
| `api/delivery-costs.js` | In-memory upload processing / pricing / per-pharmacy file generation |
| `admin/pharmacies/` | Admin UI: list/create/edit the 12 pharmacies, structured `city_rates` editor |
| `admin/delivery-costs/` | Admin UI: upload, on-screen summary, per-pharmacy downloads |

## Setup

1. **Run the migration** against your Supabase project (only adds `pharmacies`):
   - Supabase CLI: `supabase db push`, or
   - paste `supabase/migrations/20260703000000_create_pharmacies.sql` into the SQL editor.
2. **Install deps**: `npm install` (adds `xlsx` for CSV/XLSX parsing + writing).
3. **Environment variables** (in addition to the existing `SUPABASE_URL` / `SUPABASE_SECRET_KEY`):
   - No Google Maps key is needed right now — distance-based pricing is
     disabled. Pricing uses the pharmacy's city flat rates only.
   - `ADMIN_ACCESS_KEY` — *optional but recommended.* When set, the admin API
     routes (`/api/pharmacies`, `/api/delivery-costs`) require an
     `x-admin-key` header matching it; the admin pages prompt for the key and
     remember it for the session. **When unset, the admin routes are open**
     (see "Open questions" below).
4. **Seed the 12 pharmacies** via `/admin/pharmacies`.

## Pricing logic (per row)

1. Only `Task_Type = Delivery` rows are priced. `Pick-up` rows are kept in the
   sheet with a blank `Cost`.
2. Resolve the delivery city by parsing `Customer_Address`. Normalized
   (lowercase/trim) lookup in the pharmacy's `city_rates` → flat rate.
3. If the city has no flat rate (city not resolved, or not a key in
   `city_rates`), `Cost` is set to the literal **`Need to Calculate`** — never
   0 — and the row is counted under "Need to Calculate" in the summary.
   Distance-based pricing is disabled for now; the sheet's `Distance(KM)`
   column is not used, and no external APIs are called.

## Row inclusion

- `Completed` → always kept.
- `Cancelled` / `Unassigned` / `Assigned` → kept only if an agent is assigned
  (`Agent_ID`/`Agent_Name` populated); otherwise discarded.
- Any other/blank status → discarded and counted under
  "unrecognized status" in the summary (see below).

## Assumptions made (change points)

These were defaulted because the spec left them open; each is easy to change:

- **Output columns**: the single `OUTPUT_COLUMNS` array at the top of
  `api/delivery-costs.js` (`Merge_ID, Task_ID, Order_ID, Task_Type, Agent_ID,
  Agent_Name, Pick_up_From, Customer_Name, Customer_Address, Latitude,
  Longitude, Customer_Phone, Complete_Before, Completion_Time, Task_Status` +
  appended `Cost`). Edit that one array to change every sheet.
- **Unknown/blank status** (spec §4.3 said to ask): defaulted to *discard +
  surface in summary*. To instead apply the agent check, adjust the `else`
  branch in `processRows`.
- **Admin auth**: this repo had no auth. Added an optional shared-secret gate
  (`ADMIN_ACCESS_KEY`) that is **off unless the env var is set**. Set it (or add
  Vercel deployment protection on `/admin` and `/api/pharmacies`) before
  exposing this publicly — it handles customer PII.

## Output

`POST /api/delivery-costs` with `{ fileBase64, format }` returns
`{ summary, files }`. `files[i]` = `{ filename, mimeType, base64, rows,
deliveries, pickups }`, one per pharmacy, named `<file_name>.<csv|xlsx>` from
the pharmacy config. The summary reports total/kept/discarded (with reasons),
unmatched `Order_ID`s, and `Need to Calculate` rows — nothing is silently dropped.
