-- Harden operational_events grants: append-only tables must not allow TRUNCATE.

revoke truncate on table public.operational_events from authenticated;
revoke truncate on table public.operational_events from service_role;
