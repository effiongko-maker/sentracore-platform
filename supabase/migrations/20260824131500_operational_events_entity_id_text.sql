-- Polymorphic entity_id must accept module-owned identifiers that are not UUIDs
-- (e.g. Apps Script INC-2026-0001, WO-2026-0001). There is no FK; entity_type +
-- entity_id are an opaque origin reference.

alter table public.operational_events
  alter column entity_id type text using entity_id::text;

comment on column public.operational_events.entity_id is
  'Polymorphic origin id as text (no FK). May be UUID or external/module-owned id such as INC-2026-0001.';
