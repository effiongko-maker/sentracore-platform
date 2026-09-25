-- FM Diesel usage — preserve the two distinct tank measurements of the source checklist.
--
-- The MBORA DIESEL Checklist records "QTY IN THE UNDERGROUND TANK" and "QTY IN THE SURFACE TANK" separately. The
-- historical import collapsed them into opening_level (= underground + surface, proven by each row's own arithmetic)
-- and the per-tank values were not kept anywhere in the database (the provenance transformation note says they were,
-- but only the note text was stored). These nullable columns restore the distinction:
--   * NULL = not recorded (every existing row until the provenance-keyed backfill script is run; never inferred);
--   * both present  → they must add up to opening_level, the rule every imported row satisfies.
-- Additive only: no existing value is changed by this migration.

alter table public.fm_diesel_usage
  add column underground_tank_qty numeric(12, 2),
  add column surface_tank_qty numeric(12, 2);

alter table public.fm_diesel_usage
  add constraint fm_diesel_usage_tank_qty_nonnegative
    check ((underground_tank_qty is null or underground_tank_qty >= 0) and (surface_tank_qty is null or surface_tank_qty >= 0)),
  add constraint fm_diesel_usage_tank_split_matches_opening
    check (
      (underground_tank_qty is null and surface_tank_qty is null)
      or (underground_tank_qty is not null and surface_tank_qty is not null
          and underground_tank_qty + surface_tank_qty = opening_level)
    );

comment on column public.fm_diesel_usage.underground_tank_qty is
  'Quantity in the underground tank (source: QTY IN THE UNDERGROUND TANK). NULL = not recorded. With surface_tank_qty, sums to opening_level.';
comment on column public.fm_diesel_usage.surface_tank_qty is
  'Quantity in the surface tank (source: QTY IN THE SURFACE TANK). NULL = not recorded. With underground_tank_qty, sums to opening_level.';
