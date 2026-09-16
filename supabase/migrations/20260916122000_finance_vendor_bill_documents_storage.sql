-- Platform Finance — Vendor Bill document Storage foundation.
-- Private Vendor Bill-owned bucket, mirroring finance-payable-documents.
-- Event types already exist in the Vendor Bill foundation migration.
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
  'finance-vendor-bill-documents',
  'finance-vendor-bill-documents',
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
-- minted by the server after vendor bill / company / organisation checks.

comment on table public.finance_vendor_bill_documents is
  'Vendor Bill document metadata. Bytes live in the private storage bucket finance-vendor-bill-documents. Post-submission changes use supersession; draft removal may hard-delete via the service path. Distinct from finance_request_documents and finance_payable_documents.';
