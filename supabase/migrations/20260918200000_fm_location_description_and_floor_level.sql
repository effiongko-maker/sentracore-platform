-- FM Phase 1D — additive Master Data fields already used by the product form.
-- Does NOT invent location rows. Does NOT create fm_vendors.
-- Does NOT add Sheet IDs, parent text IDs, workload, manager, or vendor columns.
--
-- Justification:
--   Buildings/floors/rooms/departments create+edit already persist optional
--   description. Floors already persist optional level. Without these columns
--   the current Master Data form would silently drop supported fields.

alter table public.fm_buildings
  add column if not exists description text;

alter table public.fm_floors
  add column if not exists description text;

alter table public.fm_floors
  add column if not exists level text;

alter table public.fm_rooms
  add column if not exists description text;

alter table public.fm_departments
  add column if not exists description text;

comment on column public.fm_buildings.description is
  'Optional notes from the Master Data form. Not a required configuration field.';

comment on column public.fm_floors.description is
  'Optional notes from the Master Data form. Not a required configuration field.';

comment on column public.fm_floors.level is
  'Optional floor level label from the Master Data form (e.g. G, 1, 2, B1). Distinct from name.';

comment on column public.fm_rooms.description is
  'Optional notes from the Master Data form. Not a required configuration field.';

comment on column public.fm_departments.description is
  'Optional notes from the Master Data form. Not a required configuration field.';
