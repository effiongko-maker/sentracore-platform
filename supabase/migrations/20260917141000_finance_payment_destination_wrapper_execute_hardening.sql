-- Phase 2B forward-only hardening: Payment Destination wrapper EXECUTE boundary.
--
-- 20260917140000 installed six SECURITY DEFINER wrappers and revoked EXECUTE
-- from PUBLIC, then granted EXECUTE to service_role only. That is incomplete for
-- SentraCore's service-role-only RPC pattern: anon/authenticated must also be
-- revoked explicitly (see bootstrap_first_platform_user,
-- attach_invited_profile_to_organisation, provision_operational_identity_link).
--
-- This migration does not alter function bodies, destination data, encryption,
-- or any non-Phase-2B privileges.

revoke all on function public.finance_request_create_with_payment_destination(uuid, uuid, uuid, uuid, numeric, text, text, text, text, date, text, text, text, jsonb)
  from public;
revoke all on function public.finance_request_create_with_payment_destination(uuid, uuid, uuid, uuid, numeric, text, text, text, text, date, text, text, text, jsonb)
  from anon, authenticated;

revoke all on function public.finance_request_update_draft_with_payment_destination(uuid, uuid, uuid, numeric, text, text, text, text, date, boolean, text, text, text, jsonb)
  from public;
revoke all on function public.finance_request_update_draft_with_payment_destination(uuid, uuid, uuid, numeric, text, text, text, text, date, boolean, text, text, text, jsonb)
  from anon, authenticated;

revoke all on function public.finance_request_resubmit_with_payment_destination(uuid, uuid, uuid, numeric, text, text, text, text, date, boolean, text, text, text, jsonb)
  from public;
revoke all on function public.finance_request_resubmit_with_payment_destination(uuid, uuid, uuid, numeric, text, text, text, text, date, boolean, text, text, text, jsonb)
  from anon, authenticated;

revoke all on function public.finance_vendor_bill_create_with_payment_destination(uuid, uuid, uuid, numeric, text, text, text, text, text, date, boolean, date, text, text, jsonb)
  from public;
revoke all on function public.finance_vendor_bill_create_with_payment_destination(uuid, uuid, uuid, numeric, text, text, text, text, text, date, boolean, date, text, text, jsonb)
  from anon, authenticated;

revoke all on function public.finance_vendor_bill_update_draft_with_payment_destination(uuid, uuid, numeric, text, text, text, text, text, date, boolean, boolean, date, boolean, text, text, text, jsonb)
  from public;
revoke all on function public.finance_vendor_bill_update_draft_with_payment_destination(uuid, uuid, numeric, text, text, text, text, text, date, boolean, boolean, date, boolean, text, text, text, jsonb)
  from anon, authenticated;

revoke all on function public.finance_vendor_bill_resubmit_with_payment_destination(uuid, uuid, numeric, text, text, text, text, text, date, boolean, boolean, date, boolean, text, text, jsonb)
  from public;
revoke all on function public.finance_vendor_bill_resubmit_with_payment_destination(uuid, uuid, numeric, text, text, text, text, text, date, boolean, boolean, date, boolean, text, text, jsonb)
  from anon, authenticated;

grant execute on function public.finance_request_create_with_payment_destination(uuid, uuid, uuid, uuid, numeric, text, text, text, text, date, text, text, text, jsonb)
  to service_role;
grant execute on function public.finance_request_update_draft_with_payment_destination(uuid, uuid, uuid, numeric, text, text, text, text, date, boolean, text, text, text, jsonb)
  to service_role;
grant execute on function public.finance_request_resubmit_with_payment_destination(uuid, uuid, uuid, numeric, text, text, text, text, date, boolean, text, text, text, jsonb)
  to service_role;
grant execute on function public.finance_vendor_bill_create_with_payment_destination(uuid, uuid, uuid, numeric, text, text, text, text, text, date, boolean, date, text, text, jsonb)
  to service_role;
grant execute on function public.finance_vendor_bill_update_draft_with_payment_destination(uuid, uuid, numeric, text, text, text, text, text, date, boolean, boolean, date, boolean, text, text, text, jsonb)
  to service_role;
grant execute on function public.finance_vendor_bill_resubmit_with_payment_destination(uuid, uuid, numeric, text, text, text, text, text, date, boolean, boolean, date, boolean, text, text, jsonb)
  to service_role;
