-- FM Work — commercial route (UI: "Execution basis"). Which route this Work follows:
--
--   work_order : Issue → Execute → Submit Work Order → Pending Payment (no prior client approval required);
--   job_order  : Issue → Request Approval → Approval Granted → Job Order Issued → Execute (prior approval required).
--
-- The route is an explicit operator selection, never inferred from an amount, cost, Approval, Work Instruction,
-- status or facility. It is the Work-level source of truth; execution state stays on fm_work, approval state on
-- fm_approvals and payment state on Client Payments.
--
-- Nullable: existing (including migrated historical) Work stays NULL = legacy-unclassified. No default and no
-- backfill, so no existing row is rewritten. The application requires the route for newly created Work.

alter table public.fm_work
  add column if not exists commercial_route text;

alter table public.fm_work
  drop constraint if exists fm_work_commercial_route_check;
alter table public.fm_work
  add constraint fm_work_commercial_route_check
  check (commercial_route is null or commercial_route in ('work_order', 'job_order'));

comment on column public.fm_work.commercial_route is
  'work_order | job_order | NULL (legacy-unclassified). Explicit operator selection ("Execution basis"); never inferred. Required by the application for new Work; not changeable once a Work Instruction exists for the Work.';
