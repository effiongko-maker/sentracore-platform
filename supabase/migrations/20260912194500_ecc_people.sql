-- ECC People / shifts / attendance (minimum structures for People page).
-- Extends existing ECC Operations org-scoped persistence; does not redesign it.

-- ---------------------------------------------------------------------------
-- People (managers, relationship officers, agents)
-- ---------------------------------------------------------------------------

create table public.ecc_people (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  id text not null,
  centre_id text not null,
  name text not null,
  role text not null,
  contact_email text,
  contact_phone text,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (organisation_id, id),
  constraint ecc_people_id_nonempty check (char_length(trim(id)) > 0),
  constraint ecc_people_name_nonempty check (char_length(trim(name)) > 0),
  constraint ecc_people_role_check
    check (role in ('ecc_manager', 'relationship_officer', 'agent')),
  constraint ecc_people_status_check
    check (status in ('active', 'inactive')),
  constraint ecc_people_centre_fk
    foreign key (organisation_id, centre_id)
    references public.ecc_centres (organisation_id, id)
);

create index ecc_people_org_centre_idx
  on public.ecc_people (organisation_id, centre_id);

create index ecc_people_org_role_idx
  on public.ecc_people (organisation_id, role);

create trigger ecc_people_set_updated_at
before update on public.ecc_people
for each row execute function public.set_updated_at();

comment on table public.ecc_people is
  'ECC centre people: managers, relationship officers, and agents.';

-- ---------------------------------------------------------------------------
-- Shifts
-- ---------------------------------------------------------------------------

create table public.ecc_shifts (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  id text not null,
  centre_id text not null,
  label text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_current boolean not null default false,
  coverage_status text not null default 'unknown',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (organisation_id, id),
  constraint ecc_shifts_id_nonempty check (char_length(trim(id)) > 0),
  constraint ecc_shifts_label_nonempty check (char_length(trim(label)) > 0),
  constraint ecc_shifts_coverage_check
    check (
      coverage_status in (
        'adequate',
        'constrained',
        'uncovered',
        'unknown'
      )
    ),
  constraint ecc_shifts_window_check check (ends_at > starts_at),
  constraint ecc_shifts_centre_fk
    foreign key (organisation_id, centre_id)
    references public.ecc_centres (organisation_id, id)
);

create index ecc_shifts_org_centre_idx
  on public.ecc_shifts (organisation_id, centre_id, starts_at desc);

create unique index ecc_shifts_one_current_uidx
  on public.ecc_shifts (organisation_id, centre_id)
  where is_current;

create trigger ecc_shifts_set_updated_at
before update on public.ecc_shifts
for each row execute function public.set_updated_at();

comment on table public.ecc_shifts is
  'ECC operational shifts. At most one current shift per centre.';

-- ---------------------------------------------------------------------------
-- Shift assignments (agents assigned to a shift)
-- ---------------------------------------------------------------------------

create table public.ecc_shift_assignments (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  shift_id text not null,
  person_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (organisation_id, shift_id, person_id),
  constraint ecc_shift_assignments_shift_fk
    foreign key (organisation_id, shift_id)
    references public.ecc_shifts (organisation_id, id)
    on delete cascade,
  constraint ecc_shift_assignments_person_fk
    foreign key (organisation_id, person_id)
    references public.ecc_people (organisation_id, id)
    on delete cascade
);

create index ecc_shift_assignments_person_idx
  on public.ecc_shift_assignments (organisation_id, person_id);

-- ---------------------------------------------------------------------------
-- Attendance (sign-in / sign-out history)
-- ---------------------------------------------------------------------------

create table public.ecc_attendance (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  id text not null,
  centre_id text not null,
  person_id text not null,
  shift_id text,
  attendance_date date not null,
  signed_in_at timestamptz,
  signed_out_at timestamptz,
  status text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (organisation_id, id),
  constraint ecc_attendance_id_nonempty check (char_length(trim(id)) > 0),
  constraint ecc_attendance_status_check
    check (
      status in (
        'on_duty',
        'signed_in',
        'signed_out',
        'off_duty',
        'absent'
      )
    ),
  constraint ecc_attendance_sign_order_check
    check (
      signed_out_at is null
      or signed_in_at is null
      or signed_out_at >= signed_in_at
    ),
  constraint ecc_attendance_centre_fk
    foreign key (organisation_id, centre_id)
    references public.ecc_centres (organisation_id, id),
  constraint ecc_attendance_person_fk
    foreign key (organisation_id, person_id)
    references public.ecc_people (organisation_id, id)
    on delete cascade,
  constraint ecc_attendance_shift_fk
    foreign key (organisation_id, shift_id)
    references public.ecc_shifts (organisation_id, id)
    on delete set null
);

create index ecc_attendance_org_date_idx
  on public.ecc_attendance (organisation_id, attendance_date desc, signed_in_at desc);

create index ecc_attendance_person_idx
  on public.ecc_attendance (organisation_id, person_id, attendance_date desc);

-- At most one open attendance row per person (signed in, not yet out).
create unique index ecc_attendance_open_person_uidx
  on public.ecc_attendance (organisation_id, person_id)
  where signed_in_at is not null and signed_out_at is null;

create trigger ecc_attendance_set_updated_at
before update on public.ecc_attendance
for each row execute function public.set_updated_at();

comment on table public.ecc_attendance is
  'ECC agent sign-in / sign-out attendance history.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.ecc_people enable row level security;
alter table public.ecc_shifts enable row level security;
alter table public.ecc_shift_assignments enable row level security;
alter table public.ecc_attendance enable row level security;

create policy ecc_people_select on public.ecc_people
for select to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_people_insert on public.ecc_people
for insert to authenticated
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_people_update on public.ecc_people
for update to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
)
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_people_delete on public.ecc_people
for delete to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_shifts_select on public.ecc_shifts
for select to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_shifts_insert on public.ecc_shifts
for insert to authenticated
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_shifts_update on public.ecc_shifts
for update to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
)
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_shifts_delete on public.ecc_shifts
for delete to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_shift_assignments_select on public.ecc_shift_assignments
for select to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_shift_assignments_insert on public.ecc_shift_assignments
for insert to authenticated
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_shift_assignments_delete on public.ecc_shift_assignments
for delete to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_attendance_select on public.ecc_attendance
for select to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_attendance_insert on public.ecc_attendance
for insert to authenticated
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_attendance_update on public.ecc_attendance
for update to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
)
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

grant select, insert, update, delete on table public.ecc_people to authenticated;
grant select, insert, update, delete on table public.ecc_shifts to authenticated;
grant select, insert, delete on table public.ecc_shift_assignments to authenticated;
grant select, insert, update on table public.ecc_attendance to authenticated;

grant all on table public.ecc_people to service_role;
grant all on table public.ecc_shifts to service_role;
grant all on table public.ecc_shift_assignments to service_role;
grant all on table public.ecc_attendance to service_role;
