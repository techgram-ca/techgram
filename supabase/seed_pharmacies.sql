-- Seed the pharmacies table with the 11 pharmacies found in the
-- dispatch export (keyed by Order_ID). Names/addresses are taken from each
-- pharmacy's own Pick-up rows; city is parsed from the address. Re-runnable:
-- upserts on order_id. All pharmacies share the same city_rates.
--
-- Run in the Supabase SQL editor (or: supabase db execute -f this file) AFTER
-- the pharmacies table migration has been applied.
--
-- Note: with this rate map, delivery cities present in the sample that are NOT
-- keyed here fall through to "Need to Calculate": oshawa, king (map has "king
-- city"), barrie, ajax, hamilton, burlington, innisfil. Add keys if needed.
-- A couple of names come straight from the raw Pick_up_From text (e.g.
-- "sriprathap sathya") and may want manual cleanup in the admin UI.

insert into pharmacies (name, file_name, order_id, address, city, city_rates)
values
  ('PHARMASAVE', 'pharmasave', 644017, '8 Queen Street North, Caledon, Ontario, Canada', 'Caledon', '{"milton":6.75,"caledon":6.75,"concord":6.75,"markham":6.75,"toronto":6.75,"vaughan":4.5,"brampton":6.75,"oakville":6.75,"east york":6.75,"etobicoke":6.75,"king city":6.75,"kleinburg":6.75,"thornhill":6.75,"woodbridge":4.5,"mississauga":6.75,"scarborough":6.75,"caledon east":6.75,"richmond hill":6.75}'::jsonb),
  ('SelectHealth Pharmacy', 'selecthealth-pharmacy', 644686, '3981 Major Mackenzie Drive West, Vaughan, Ontario, Canada', 'Vaughan', '{"milton":6.75,"caledon":6.75,"concord":6.75,"markham":6.75,"toronto":6.75,"vaughan":4.5,"brampton":6.75,"oakville":6.75,"east york":6.75,"etobicoke":6.75,"king city":6.75,"kleinburg":6.75,"thornhill":6.75,"woodbridge":4.5,"mississauga":6.75,"scarborough":6.75,"caledon east":6.75,"richmond hill":6.75}'::jsonb),
  ('sriprathap sathya', 'sriprathap-sathya', 647544, '3080 Windwood Drive, Mississauga, Peel, Ontario, Canada', 'Mississauga', '{"milton":6.75,"caledon":6.75,"concord":6.75,"markham":6.75,"toronto":6.75,"vaughan":4.5,"brampton":6.75,"oakville":6.75,"east york":6.75,"etobicoke":6.75,"king city":6.75,"kleinburg":6.75,"thornhill":6.75,"woodbridge":4.5,"mississauga":6.75,"scarborough":6.75,"caledon east":6.75,"richmond hill":6.75}'::jsonb),
  ('BATTLEFORD IDA', 'battleford-ida', 647548, '6405 Erin Mills Pkwy, Mississauga, ON L5N 4H4, Canada, Canada', 'Mississauga', '{"milton":6.75,"caledon":6.75,"concord":6.75,"markham":6.75,"toronto":6.75,"vaughan":4.5,"brampton":6.75,"oakville":6.75,"east york":6.75,"etobicoke":6.75,"king city":6.75,"kleinburg":6.75,"thornhill":6.75,"woodbridge":4.5,"mississauga":6.75,"scarborough":6.75,"caledon east":6.75,"richmond hill":6.75}'::jsonb),
  ('Derry village pharmacy', 'derry-village-pharmacy', 647549, 'Guru Lukshmi, 7070 St Barbara Blvd, Mississauga, ON L5W, Canada, Canada', 'Mississauga', '{"milton":6.75,"caledon":6.75,"concord":6.75,"markham":6.75,"toronto":6.75,"vaughan":4.5,"brampton":6.75,"oakville":6.75,"east york":6.75,"etobicoke":6.75,"king city":6.75,"kleinburg":6.75,"thornhill":6.75,"woodbridge":4.5,"mississauga":6.75,"scarborough":6.75,"caledon east":6.75,"richmond hill":6.75}'::jsonb),
  ('BRITLIN PHARMACY', 'britlin-pharmacy', 647639, '5985 Rodeo Drive, Mississauga, Peel, Ontario, Canada', 'Mississauga', '{"milton":6.75,"caledon":6.75,"concord":6.75,"markham":6.75,"toronto":6.75,"vaughan":4.5,"brampton":6.75,"oakville":6.75,"east york":6.75,"etobicoke":6.75,"king city":6.75,"kleinburg":6.75,"thornhill":6.75,"woodbridge":4.5,"mississauga":6.75,"scarborough":6.75,"caledon east":6.75,"richmond hill":6.75}'::jsonb),
  ('Prima Care Pharmacy', 'prima-care-pharmacy', 647648, '9600 Islington Ave, Woodbridge, ON L4H 2T1, Canada, Canada', 'Woodbridge', '{"milton":6.75,"caledon":6.75,"concord":6.75,"markham":6.75,"toronto":6.75,"vaughan":4.5,"brampton":6.75,"oakville":6.75,"east york":6.75,"etobicoke":6.75,"king city":6.75,"kleinburg":6.75,"thornhill":6.75,"woodbridge":4.5,"mississauga":6.75,"scarborough":6.75,"caledon east":6.75,"richmond hill":6.75}'::jsonb),
  ('RUTHERFORD GUARDIAN', 'rutherford-guardian', 647845, '5283 Rutherford Road, Vaughan, York, Ontario, Canada', 'Vaughan', '{"milton":6.75,"caledon":6.75,"concord":6.75,"markham":6.75,"toronto":6.75,"vaughan":4.5,"brampton":6.75,"oakville":6.75,"east york":6.75,"etobicoke":6.75,"king city":6.75,"kleinburg":6.75,"thornhill":6.75,"woodbridge":4.5,"mississauga":6.75,"scarborough":6.75,"caledon east":6.75,"richmond hill":6.75}'::jsonb),
  ('St. George Dispensary Inc.', 'st-george-dispensary-inc', 647891, '585 Ontario Street South, Milton, Ontario, Canada', 'Milton', '{"milton":6.75,"caledon":6.75,"concord":6.75,"markham":6.75,"toronto":6.75,"vaughan":4.5,"brampton":6.75,"oakville":6.75,"east york":6.75,"etobicoke":6.75,"king city":6.75,"kleinburg":6.75,"thornhill":6.75,"woodbridge":4.5,"mississauga":6.75,"scarborough":6.75,"caledon east":6.75,"richmond hill":6.75}'::jsonb),
  ('ERIN CREEK PHARMASAVE PHARMACY', 'erin-creek-pharmasave-pharmacy', 648013, '6400 Millcreek Drive, Mississauga, ON, Canada, Canada', 'Mississauga', '{"milton":6.75,"caledon":6.75,"concord":6.75,"markham":6.75,"toronto":6.75,"vaughan":4.5,"brampton":6.75,"oakville":6.75,"east york":6.75,"etobicoke":6.75,"king city":6.75,"kleinburg":6.75,"thornhill":6.75,"woodbridge":4.5,"mississauga":6.75,"scarborough":6.75,"caledon east":6.75,"richmond hill":6.75}'::jsonb),
  ('SKYWARD MEDICOS PHARMACY', 'skyward-medicos-pharmacy', 649491, '2255 Dundas Street West, Mississauga, Peel, Ontario, Canada', 'Mississauga', '{"milton":6.75,"caledon":6.75,"concord":6.75,"markham":6.75,"toronto":6.75,"vaughan":4.5,"brampton":6.75,"oakville":6.75,"east york":6.75,"etobicoke":6.75,"king city":6.75,"kleinburg":6.75,"thornhill":6.75,"woodbridge":4.5,"mississauga":6.75,"scarborough":6.75,"caledon east":6.75,"richmond hill":6.75}'::jsonb)
on conflict (order_id) do update set
  name       = excluded.name,
  file_name  = excluded.file_name,
  address    = excluded.address,
  city       = excluded.city,
  city_rates = excluded.city_rates,
  is_active  = true,
  updated_at = now();
