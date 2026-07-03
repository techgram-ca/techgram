-- Latitude/Longitude are no longer used (distance-based pricing is disabled;
-- pricing is city-flat-rate only). Drop them from any already-provisioned
-- pharmacies table. Idempotent: safe whether or not the columns exist.

alter table pharmacies drop column if exists latitude;
alter table pharmacies drop column if exists longitude;
