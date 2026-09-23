-- FM Work Order route — the Client Payment requested for a submitted Work Order.
--
-- Work Order route (fm_work.commercial_route = 'work_order'):
--   Issue → Execute → Submit Work Order → Client Payment (payment_request) → awaiting / partially received / received
--
-- The Work Order (fm_work_instructions, order_type = work_order) is the evidence / commercial submission for completed
-- Work; the Client Payment (fm_cost_submissions, submission_kind = payment_request) is the amount requested from the
-- client, and its settlement stays DERIVED from fm_reimbursement_payments. The two stay distinct — the only addition is
-- the relationship: fm_cost_submissions.work_instruction_id (nullable). Nothing about receipts or the Work Order's own
-- fields changes, and no payment state is copied onto the Work Order.
--
-- Additive only: existing Client Payments (including the 8 imported) keep work_instruction_id = NULL; no backfill.

alter table public.fm_cost_submissions
  add column if not exists work_instruction_id uuid;

alter table public.fm_cost_submissions
  drop constraint if exists fm_cost_submissions_work_instruction_fk;
alter table public.fm_cost_submissions
  add constraint fm_cost_submissions_work_instruction_fk
    foreign key (organisation_id, work_instruction_id)
    references public.fm_work_instructions (organisation_id, id)
    on delete restrict;

-- Only a payment request is raised for a Work Order (claims recover costs; instalments bill the contract).
alter table public.fm_cost_submissions
  drop constraint if exists fm_cost_submissions_work_instruction_kind_check;
alter table public.fm_cost_submissions
  add constraint fm_cost_submissions_work_instruction_kind_check
    check (work_instruction_id is null or submission_kind = 'payment_request');

-- At most one active Client Payment per Work Order (a cancelled request does not block a replacement).
create unique index if not exists fm_cost_submissions_org_work_instruction_active_uidx
  on public.fm_cost_submissions (organisation_id, work_instruction_id)
  where work_instruction_id is not null and status <> 'cancelled';

-- The linked instruction must be a Work Order, and the link is fixed once made.
create or replace function public.fm_cost_submissions_work_order_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.work_instruction_id is not null
     and new.work_instruction_id is distinct from old.work_instruction_id then
    raise exception 'fm_cost_submissions.work_instruction_id cannot be changed once set' using errcode = '23514';
  end if;
  if new.work_instruction_id is not null and (tg_op = 'INSERT' or new.work_instruction_id is distinct from old.work_instruction_id) then
    if not exists (
      select 1 from public.fm_work_instructions i
      where i.organisation_id = new.organisation_id and i.id = new.work_instruction_id and i.order_type = 'work_order'
    ) then
      raise exception 'A Client Payment can only be linked to a Work Order' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists fm_cost_submissions_work_order_guard on public.fm_cost_submissions;
create trigger fm_cost_submissions_work_order_guard
before insert or update on public.fm_cost_submissions
for each row execute function public.fm_cost_submissions_work_order_guard();

create index if not exists fm_cost_submissions_org_work_instruction_idx
  on public.fm_cost_submissions (organisation_id, work_instruction_id)
  where work_instruction_id is not null;

comment on column public.fm_cost_submissions.work_instruction_id is
  'The submitted Work Order this payment request bills (Work Order route). NULL for all other Client Payments. Fixed once set; one active request per Work Order. Settlement stays derived from fm_reimbursement_payments.';
