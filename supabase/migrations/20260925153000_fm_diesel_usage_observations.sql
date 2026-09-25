-- FM Diesel usage — a row is a dated physical OBSERVATION, not an enforced arithmetic cycle (operator clarification).
--
-- Tank readings are physical measurements (dipstick/gauge; they vary with temperature and timing). They need not
-- reconcile exactly with the reported consumption, and a legitimate dated observation may have an incomplete cycle.
-- SentraCore therefore stores what was recorded and nothing else:
--   * opening_level, closing_level, added, consumption and the tank split are each independently nullable;
--     NULL = not recorded (never 0);
--   * consumption becomes a RECORDED value (it was generated as opening + added − closing). DROP EXPRESSION keeps every
--     existing row's current value, so no existing figure changes here;
--   * no rule forces the split to equal a level or consumption to equal opening − closing — a difference is shown to
--     the reviewer as a variance, never corrected and never blocking;
--   * a row must still carry at least one recorded observation (a level, a tank quantity or consumption).
-- Operational rows keep their generator requirement (fm_diesel_usage_generator_required_operational).

alter table public.fm_diesel_usage drop constraint fm_diesel_usage_tank_split_matches_opening;

alter table public.fm_diesel_usage alter column consumption drop expression;

alter table public.fm_diesel_usage
  alter column opening_level drop not null,
  alter column closing_level drop not null,
  alter column added drop not null,
  alter column added drop default;

alter table public.fm_diesel_usage
  add constraint fm_diesel_usage_levels_nonnegative
    check ((opening_level is null or opening_level >= 0) and (closing_level is null or closing_level >= 0)
           and (added is null or added >= 0)),
  add constraint fm_diesel_usage_has_observation
    check (opening_level is not null or closing_level is not null or underground_tank_qty is not null
           or surface_tank_qty is not null or consumption is not null);

comment on column public.fm_diesel_usage.opening_level is 'Opening tank reading (L) as recorded. NULL = not recorded.';
comment on column public.fm_diesel_usage.closing_level is 'Closing tank reading / balance (L) as recorded. NULL = not recorded.';
comment on column public.fm_diesel_usage.added is 'Diesel delivered (L) as recorded. NULL = not recorded (never assumed 0).';
comment on column public.fm_diesel_usage.consumption is
  'Consumption (L) as RECORDED — not derived. May differ from opening + added − closing (physical measurement variance). NULL = not recorded.';
comment on column public.fm_diesel_usage.underground_tank_qty is
  'Quantity in the underground tank (source: QTY IN THE UNDERGROUND TANK) as recorded. NULL = not recorded.';
comment on column public.fm_diesel_usage.surface_tank_qty is
  'Quantity in the surface tank (source: QTY IN THE SURFACE TANK) as recorded. NULL = not recorded.';
