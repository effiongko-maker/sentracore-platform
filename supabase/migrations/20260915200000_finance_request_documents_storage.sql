-- Platform Finance — Financial Requests Slice 4: document Storage foundation.
-- Private bucket + event types for remove/supersede. No smoke data. No UUID hard-coding.

-- ---------------------------------------------------------------------------
-- Request event types: document_removed / document_superseded
-- ---------------------------------------------------------------------------

alter table public.finance_request_events
  drop constraint if exists finance_request_events_type_check;

alter table public.finance_request_events
  add constraint finance_request_events_type_check
  check (
    event_type in (
      'created',
      'updated',
      'submitted',
      'review_started',
      'queried',
      'resubmitted',
      'sent_to_ceo',
      'approved',
      'partially_approved',
      'rejected',
      'document_added',
      'document_removed',
      'document_superseded',
      'field_changed'
    )
  );

-- ---------------------------------------------------------------------------
-- Document path uniqueness (server-derived locations)
-- ---------------------------------------------------------------------------

create unique index if not exists finance_request_documents_bucket_path_uidx
  on public.finance_request_documents (storage_bucket, storage_path);

-- Authenticated may UPDATE for supersession markers when they own an editable request.
-- Hard delete of draft documents is service-role only (server path).
drop policy if exists finance_request_documents_update on public.finance_request_documents;
create policy finance_request_documents_update on public.finance_request_documents
for update to authenticated
using (
  exists (
    select 1
    from public.finance_requests r
    where r.id = request_id
      and public.is_org_member(r.organisation_id)
      and r.requester_profile_id = auth.uid()
      and r.status in ('draft', 'query', 'resubmitted', 'submitted', 'under_review', 'pending_ceo_approval')
      and public.has_finance_capability(r.organisation_id, 'platform_finance.request.create')
  )
)
with check (
  exists (
    select 1
    from public.finance_requests r
    where r.id = request_id
      and public.is_org_member(r.organisation_id)
      and r.requester_profile_id = auth.uid()
      and r.status in ('draft', 'query', 'resubmitted', 'submitted', 'under_review', 'pending_ceo_approval')
      and public.has_finance_capability(r.organisation_id, 'platform_finance.request.create')
  )
);

grant update on table public.finance_request_documents to authenticated;

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
  'finance-request-documents',
  'finance-request-documents',
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
-- minted by the server after request/company/organisation checks.

comment on table public.finance_request_documents is
  'Financial Request document metadata. Bytes live in private storage bucket finance-request-documents. Post-submit changes use supersession; draft removal may hard-delete via service path.';
