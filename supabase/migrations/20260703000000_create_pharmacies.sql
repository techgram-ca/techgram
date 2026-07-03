-- Delivery-cost automation: pharmacy pricing configuration.
-- This is the ONLY table involved in the feature. No uploaded delivery /
-- customer data is ever persisted — this table holds pharmacy config only.

create table pharmacies (
  id                uuid primary key default gen_random_uuid(),

  name              text not null,                  -- canonical display name (used to fill pharmacy sheets —
                                                     -- NOT the raw Pick_up_From text from the sheet)
  file_name         text not null unique,           -- exact base filename for this pharmacy's output sheet
                                                     -- (no extension — extension added at export time based on
                                                     -- input format)
  order_id          integer not null unique,        -- the pharmacy's unique Order_ID as it appears in dispatch
                                                     -- sheets; this is the ONLY key used to match sheet rows
                                                     -- to a pharmacy (each pharmacy has exactly one Order_ID)

  address           text not null,
  city              text not null,                  -- pharmacy's home city
  latitude          numeric(9,6) not null,
  longitude         numeric(9,6) not null,

  -- City-based flat rates. Keys are normalized (lowercase, trimmed) city names.
  -- Include the pharmacy's own home city as one of the keys too.
  -- e.g. { "vaughan": 4.00, "brampton": 5.50, "toronto": 5.00 }
  city_rates        jsonb not null default '{}',

  -- Fallback rate ($/km), single flat value, applied when the delivery's
  -- city isn't a key in city_rates. e.g. 1.50
  per_km_rate       numeric(6,2) not null default 0,

  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index idx_pharmacies_order_id on pharmacies (order_id);

alter table pharmacies enable row level security;

-- Keep updated_at fresh on every update.
create or replace function set_pharmacies_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_pharmacies_updated_at
  before update on pharmacies
  for each row execute function set_pharmacies_updated_at();
