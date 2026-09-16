-- Platform Finance — Payables Slice 4: document Storage foundation.
-- Private Payable-owned bucket. Event types already exist in Slice 1.
-- No smoke data. No UUID hard-coding. No public storage.objects policies.

-- ---------------------------------------------------------------------------
-- Private Storage bucket (service-role uploads via server; no public access)
-- ---------------------------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'finance-payable-documents',
  'finance-payable-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No authenticated/anon SELECT/INSERT/UPDATE/DELETE policies on this bucket.
-- Objects are reachable only via service_role (API after authorization) or signed URLs
-- minted by the server after payable/company/organisation checks.

comment on table public.finance_payable_documents is
  'Payable document metadata. Bytes live in private storage bucket finance-payable-documents. Post-submit changes use supersession; draft removal may hard-delete via service path. Distinct from finance_request_documents.';
