-- ECC Operations user-level authority (platform.ecc_operations.*)
-- Organisation module enablement remains product enablement only.
-- Explicit grants required to enter ECC — same discipline as Command Centre.
-- Super Admin does NOT auto-receive ECC capabilities.
-- Does NOT change organisation_modules rows (ECC may remain org-enabled).

alter table public.platform_capability_grants
  drop constraint if exists platform_capability_grants_capability_format;

alter table public.platform_capability_grants
  add constraint platform_capability_grants_capability_format
  check (
    capability ~ '^platform\.(command_centre|ecc_operations)(\.[a-z0-9_]+)+$'
  );

comment on table public.platform_capability_grants is
  'Explicit platform-scoped capability grants (Command Centre, ECC Operations). Never derived from Super Admin, FM executive role, or Finance capabilities. Organisation module enablement is separate from user grants.';
