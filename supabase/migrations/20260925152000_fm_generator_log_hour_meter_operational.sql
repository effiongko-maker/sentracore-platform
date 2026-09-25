-- FM Generator Log — Start and End are GENERATOR HOUR-METER READINGS (operational review with the FM operator), not
-- clock times. The hour_meter basis (start_meter_reading / end_meter_reading, run hours derived as end − start, no
-- clock times) was previously allowed for imported historical rows only; the product now records every new log on
-- that basis. This migration only lifts the historical-only restriction; the reading rules themselves are unchanged
-- (both readings present, end >= start, no clock times). Diesel used stays optional on this basis (NULL = not
-- recorded, never 0). No existing row is changed.

alter table public.fm_generator_logs drop constraint fm_generator_logs_hour_meter_basis;
alter table public.fm_generator_logs
  add constraint fm_generator_logs_hour_meter_basis
    check (
      log_basis <> 'hour_meter'
      or (start_meter_reading is not null and end_meter_reading is not null
          and end_meter_reading >= start_meter_reading
          and started_at is null and ended_at is null)
    );

comment on column public.fm_generator_logs.log_basis is
  'hour_meter (the product basis: Start/End are generator hour-meter readings; run hours = end − start) | clock_times (legacy basis: run start/end instants; never written by the product).';
comment on column public.fm_generator_logs.start_meter_reading is 'Generator hour-meter reading at the start of the run ("Start Reading"). Not a time.';
comment on column public.fm_generator_logs.end_meter_reading is 'Generator hour-meter reading at the end of the run ("End Reading"). Not a time.';
