-- FM Phase 2J — Vendors foundation (empty organisation-scoped master data).
-- Table: fm_vendors. Server-mediated only (RLS on, service_role grants only).
-- Does NOT migrate Sheet Vendors (the legacy Vendors sheet holds 0 rows).
--
-- FM Vendors are a bounded FM master-data register: external vendors / service
-- providers with a name, optional user code, category, contact and status.
-- They are NOT Platform Finance counterparties / vendor bills — no coupling, no
-- shared identity, no company / account / ledger semantics.
--
-- No FM domain currently stores a vendor reference (checked: incidents, work,
-- work instructions, approvals, costs, assets, requests), so there are no
-- relationships to replace. The fumigation / deep-cleaning logs carry a free-text
-- "Vendor" label; those Sheet-backed logs are out of scope and are NOT linked.

create table public.fm_vendors (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name text not null,
  code text,
  category text,
  contact_name text,
  email text,
  phone text,
  description text,
  status text not null default 'active',
  created_by_profile_id uuid,
  updated_by_profile_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fm_vendors_org_id_unique unique (organisation_id, id),
  constraint fm_vendors_name_nonempty check (char_length(trim(name)) > 0),
  constraint fm_vendors_code_nonempty check (code is null or char_length(trim(code)) > 0),
  constraint fm_vendors_category_check
    check (category is null or category in ('HVAC', 'Electrical', 'Plumbing', 'Fire & Safety', 'Cleaning', 'Security', 'IT', 'General')),
  constraint fm_vendors_status_check check (status in ('active', 'pending', 'inactive')),
  constraint fm_vendors_created_by_fk
    foreign key (organisation_id, created_by_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (created_by_profile_id),
  constraint fm_vendors_updated_by_fk
    foreign key (organisation_id, updated_by_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (updated_by_profile_id)
);

create unique index fm_vendors_org_code_uidx on public.fm_vendors (organisation_id, lower(code)) where code is not null;
create index fm_vendors_org_status_idx on public.fm_vendors (organisation_id, status);
create index fm_vendors_org_category_idx on public.fm_vendors (organisation_id, category) where category is not null;
create index fm_vendors_org_created_idx on public.fm_vendors (organisation_id, created_at desc);

create trigger fm_vendors_set_updated_at
before update on public.fm_vendors
for each row execute function public.set_updated_at();

comment on table public.fm_vendors is
  'FM Vendor master data (external vendors / service providers). UUID is authoritative; code is an optional user reference. Not Platform Finance counterparties. Never deleted — status inactive is the soft-deactivation. Sheet Vendors are frozen legacy.';

alter table public.fm_vendors enable row level security;
revoke all on table public.fm_vendors from public, anon, authenticated;
grant all on table public.fm_vendors to service_role;
