import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import type { RequestListParams } from "@/modules/requests/types";
import {
  EMPTY_REQUEST_LINKS,
  FM_REQUEST_SELECT,
  FmRequestNotFoundError,
  FmRequestUnavailableError,
  FmRequestValidationError,
  UUID_RE,
  generateNextRequestCode,
  sanitizeSearchTerm,
  type FmRequestLinks,
  type FmRequestRow,
  type ParsedCreateRequest,
  type ParsedUpdateRequest,
} from "./fmRequestDomain";

type AdminClient = ReturnType<typeof createAdminClient>;

const CODE_RETRY_LIMIT = 5;

function db(): AdminClient {
  try {
    return createAdminClient();
  } catch {
    throw new FmRequestUnavailableError("Request storage is unavailable.");
  }
}

function isUniqueViolation(
  error: { code?: string; message?: string } | null
): boolean {
  return (
    error?.code === "23505" ||
    /duplicate key|unique constraint/i.test(error?.message ?? "")
  );
}

function throwDb(
  error: { code?: string; message?: string } | null,
  fallback: string
): never {
  const message = error?.message?.trim() || fallback;
  if (isUniqueViolation(error)) {
    throw new FmRequestValidationError(
      "A request with this reference already exists in the organisation."
    );
  }
  if (error?.code === "23503" || /foreign key/i.test(message)) {
    throw new FmRequestValidationError(
      "Request references an invalid facility or profile for this organisation."
    );
  }
  if (error?.code === "23514" || /check constraint/i.test(message)) {
    throw new FmRequestValidationError("Request values failed validation.");
  }
  throw new FmRequestUnavailableError("Request storage is unavailable.");
}

function asRow(value: unknown): FmRequestRow {
  const rec = value as Record<string, unknown>;
  const text = (key: string) => (rec[key] != null ? String(rec[key]) : null);
  return {
    id: String(rec.id),
    organisation_id: String(rec.organisation_id),
    code: String(rec.code ?? ""),
    facility_id: String(rec.facility_id),
    title: String(rec.title ?? ""),
    description: text("description"),
    location_detail: text("location_detail"),
    request_type: text("request_type"),
    status: String(rec.status ?? "submitted"),
    occurred_at: String(rec.occurred_at ?? ""),
    reporter_name: text("reporter_name"),
    reporter_contact: text("reporter_contact"),
    reported_by_profile_id: text("reported_by_profile_id"),
    created_by_profile_id: text("created_by_profile_id"),
    updated_by_profile_id: text("updated_by_profile_id"),
    created_at: String(rec.created_at ?? ""),
    updated_at: String(rec.updated_at ?? ""),
  };
}

export class FmRequestRepository {
  constructor(
    private readonly organisationId: string,
    private readonly admin: AdminClient = db()
  ) {}

  async resolveFacilityId(facilityIdOrCode: string): Promise<string> {
    const target = facilityIdOrCode.trim();
    if (!target) throw new FmRequestValidationError("Facility is required.");

    const query = this.admin
      .from("fm_facilities")
      .select("id")
      .eq("organisation_id", this.organisationId);
    const { data, error } = UUID_RE.test(target)
      ? await query.eq("id", target).maybeSingle()
      : await query.ilike("code", target).maybeSingle();
    if (error) throwDb(error, "Unable to resolve facility.");
    if (!data) {
      throw new FmRequestValidationError(
        "Facility not found in this organisation."
      );
    }
    return String((data as { id: string }).id);
  }

  async getByIdOrCode(idOrCode: string): Promise<FmRequestRow | null> {
    const target = idOrCode.trim();
    if (!target) return null;

    if (UUID_RE.test(target)) {
      const { data, error } = await this.admin
        .from("fm_requests")
        .select(FM_REQUEST_SELECT)
        .eq("organisation_id", this.organisationId)
        .eq("id", target)
        .maybeSingle();
      if (error) throwDb(error, "Unable to load request.");
      return data ? asRow(data) : null;
    }

    const { data, error } = await this.admin
      .from("fm_requests")
      .select(FM_REQUEST_SELECT)
      .eq("organisation_id", this.organisationId)
      .eq("code", target.toUpperCase())
      .maybeSingle();
    if (error) throwDb(error, "Unable to load request.");
    return data ? asRow(data) : null;
  }

  async listPage(
    params: RequestListParams
  ): Promise<{ rows: FmRequestRow[]; total: number }> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 8;

    let query = this.admin
      .from("fm_requests")
      .select(FM_REQUEST_SELECT, { count: "exact" })
      .eq("organisation_id", this.organisationId);

    if (params.status && params.status !== "all") {
      query = query.eq("status", params.status);
    }

    if (params.facilityId && params.facilityId !== "all") {
      const facilityId = UUID_RE.test(params.facilityId)
        ? params.facilityId
        : await this.resolveFacilityIdOrNull(params.facilityId);
      // Unknown facility filter matches nothing (a valid empty result).
      if (!facilityId) return { rows: [], total: 0 };
      query = query.eq("facility_id", facilityId);
    }

    const search = params.search ? sanitizeSearchTerm(params.search) : "";
    if (search) {
      const like = `%${search}%`;
      query = query.or(
        [
          `title.ilike.${like}`,
          `code.ilike.${like}`,
          `description.ilike.${like}`,
          `reporter_name.ilike.${like}`,
          `reporter_contact.ilike.${like}`,
          `location_detail.ilike.${like}`,
        ].join(",")
      );
    }

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .order("code", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throwDb(error, "Unable to load requests.");
    return { rows: (data ?? []).map(asRow), total: count ?? 0 };
  }

  private async resolveFacilityIdOrNull(
    facilityIdOrCode: string
  ): Promise<string | null> {
    try {
      return await this.resolveFacilityId(facilityIdOrCode);
    } catch (error) {
      if (error instanceof FmRequestValidationError) return null;
      throw error;
    }
  }

  /** Derive Work + Incident links for a set of Requests (two queries, no N+1). */
  async linksFor(requestIds: string[]): Promise<Map<string, FmRequestLinks>> {
    const result = new Map<string, FmRequestLinks>();
    if (requestIds.length === 0) return result;
    for (const id of requestIds) {
      result.set(id, { maintenanceIds: [], incidentIds: [] });
    }

    const [work, incidents] = await Promise.all([
      this.admin
        .from("fm_work")
        .select("code, source_request_id")
        .eq("organisation_id", this.organisationId)
        .in("source_request_id", requestIds)
        .order("code", { ascending: true }),
      this.admin
        .from("fm_request_incident_links")
        .select("request_id, incident_ref")
        .eq("organisation_id", this.organisationId)
        .in("request_id", requestIds)
        .order("created_at", { ascending: true }),
    ]);
    if (work.error) throwDb(work.error, "Unable to load request Work links.");
    if (incidents.error) {
      throwDb(incidents.error, "Unable to load request Incident links.");
    }

    for (const row of work.data ?? []) {
      const rec = row as { code: string; source_request_id: string };
      result.get(rec.source_request_id)?.maintenanceIds.push(String(rec.code));
    }
    for (const row of incidents.data ?? []) {
      const rec = row as { request_id: string; incident_ref: string };
      result.get(rec.request_id)?.incidentIds.push(String(rec.incident_ref));
    }
    return result;
  }

  async linksForOne(requestId: string): Promise<FmRequestLinks> {
    const map = await this.linksFor([requestId]);
    return map.get(requestId) ?? { ...EMPTY_REQUEST_LINKS };
  }

  private async latestCodeForYear(year: number): Promise<string | null> {
    const { data, error } = await this.admin
      .from("fm_requests")
      .select("code")
      .eq("organisation_id", this.organisationId)
      .ilike("code", `REQ-${year}-%`)
      .order("code", { ascending: false })
      .limit(1);
    if (error) throwDb(error, "Unable to allocate request reference.");
    const row = (data ?? [])[0] as { code?: string } | undefined;
    return row?.code ?? null;
  }

  /**
   * `actorProfileId` is null for anonymous occupant-portal intake.
   * The unique (organisation, lower(code)) index arbitrates concurrent
   * allocation; a collision retries with the next reference.
   */
  async create(
    input: ParsedCreateRequest,
    actorProfileId: string | null
  ): Promise<FmRequestRow> {
    const facilityId = await this.resolveFacilityId(input.facilityId);

    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt += 1) {
      const code = generateNextRequestCode(
        await this.latestCodeForYear(new Date().getUTCFullYear())
      );
      const { data, error } = await this.admin
        .from("fm_requests")
        .insert({
          organisation_id: this.organisationId,
          code,
          facility_id: facilityId,
          title: input.title,
          description: input.description ?? null,
          location_detail: input.locationDetail ?? null,
          request_type: input.requestType ?? null,
          status: input.status,
          occurred_at: input.occurredAt,
          reporter_name: input.reporterName ?? null,
          reporter_contact: input.reporterContact ?? null,
          reported_by_profile_id: input.reportedByProfileId ?? null,
          created_by_profile_id: actorProfileId,
          updated_by_profile_id: actorProfileId,
        })
        .select(FM_REQUEST_SELECT)
        .single();

      if (error) {
        if (isUniqueViolation(error) && attempt < CODE_RETRY_LIMIT - 1) continue;
        throwDb(error, "Unable to create request.");
      }
      if (!data) {
        throw new FmRequestUnavailableError("Request create returned no row.");
      }
      return asRow(data);
    }
    throw new FmRequestUnavailableError("Unable to allocate request reference.");
  }

  async update(
    input: ParsedUpdateRequest,
    actorProfileId: string
  ): Promise<FmRequestRow> {
    const existing = await this.getByIdOrCode(input.id);
    if (!existing) {
      throw new FmRequestNotFoundError(`Request ${input.id} not found.`);
    }

    const patch: Record<string, unknown> = {
      updated_by_profile_id: actorProfileId,
    };
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.facilityId !== undefined) {
      patch.facility_id = await this.resolveFacilityId(input.facilityId);
    }
    if (input.locationDetail !== undefined) {
      patch.location_detail = input.locationDetail;
    }
    if (input.requestType !== undefined) patch.request_type = input.requestType;
    if (input.occurredAt !== undefined) patch.occurred_at = input.occurredAt;
    if (input.reporterName !== undefined) patch.reporter_name = input.reporterName;
    if (input.reporterContact !== undefined) {
      patch.reporter_contact = input.reporterContact;
    }
    if (input.reportedByProfileId !== undefined) {
      patch.reported_by_profile_id = input.reportedByProfileId;
    }

    return this.applyPatch(existing.id, patch, input.id);
  }

  async setStatus(
    idOrCode: string,
    status: string,
    actorProfileId: string
  ): Promise<{ row: FmRequestRow; previousStatus: string }> {
    const existing = await this.getByIdOrCode(idOrCode);
    if (!existing) {
      throw new FmRequestNotFoundError(`Request ${idOrCode} not found.`);
    }
    if (existing.status === status) {
      return { row: existing, previousStatus: existing.status };
    }
    const row = await this.applyPatch(
      existing.id,
      { status, updated_by_profile_id: actorProfileId },
      idOrCode
    );
    return { row, previousStatus: existing.status };
  }

  private async applyPatch(
    id: string,
    patch: Record<string, unknown>,
    label: string
  ): Promise<FmRequestRow> {
    const { data, error } = await this.admin
      .from("fm_requests")
      .update(patch)
      .eq("organisation_id", this.organisationId)
      .eq("id", id)
      .select(FM_REQUEST_SELECT)
      .single();
    if (error) throwDb(error, "Unable to update request.");
    if (!data) throw new FmRequestNotFoundError(`Request ${label} not found.`);
    return asRow(data);
  }

  /** Request that already owns this Incident, if any (transitional link). */
  async requestIdForIncident(incidentRef: string): Promise<string | null> {
    const { data, error } = await this.admin
      .from("fm_request_incident_links")
      .select("request_id")
      .eq("organisation_id", this.organisationId)
      .ilike("incident_ref", incidentRef.trim())
      .maybeSingle();
    if (error) throwDb(error, "Unable to load incident link.");
    return data ? String((data as { request_id: string }).request_id) : null;
  }

  /**
   * Idempotent: linking the same Incident to the same Request is a no-op.
   * An Incident already owned by another Request is a validation error.
   */
  async linkIncident(
    requestId: string,
    incidentRef: string,
    actorProfileId: string
  ): Promise<{ created: boolean }> {
    const ref = incidentRef.trim();
    if (!ref) throw new FmRequestValidationError("Incident id is required.");

    const owner = await this.requestIdForIncident(ref);
    if (owner) {
      if (owner === requestId) return { created: false };
      throw new FmRequestValidationError(
        `Incident ${ref} is already linked to another Request.`
      );
    }

    const { error } = await this.admin.from("fm_request_incident_links").insert({
      organisation_id: this.organisationId,
      request_id: requestId,
      incident_ref: ref,
      linked_by_profile_id: actorProfileId,
    });
    if (error) {
      if (isUniqueViolation(error)) {
        const raced = await this.requestIdForIncident(ref);
        if (raced === requestId) return { created: false };
        throw new FmRequestValidationError(
          `Incident ${ref} is already linked to another Request.`
        );
      }
      throwDb(error, "Unable to link incident.");
    }
    return { created: true };
  }

  /** Display code of a facility (legacy Sheet domains still key on it). */
  async facilityCodeById(facilityId: string): Promise<string | null> {
    const { data, error } = await this.admin
      .from("fm_facilities")
      .select("code")
      .eq("organisation_id", this.organisationId)
      .eq("id", facilityId)
      .maybeSingle();
    if (error) throwDb(error, "Unable to resolve facility.");
    return data ? String((data as { code: string }).code) : null;
  }

  /** Incident ref (lower-cased) → owning Request code, for the given refs. */
  async incidentOwners(refs: string[]): Promise<Map<string, string>> {
    const owners = new Map<string, string>();
    const wanted = [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))];
    if (wanted.length === 0) return owners;
    const { data: links, error } = await this.admin
      .from("fm_request_incident_links")
      .select("incident_ref, request_id")
      .eq("organisation_id", this.organisationId)
      .in("incident_ref", wanted);
    if (error) throwDb(error, "Unable to load incident links.");
    const requestIds = [
      ...new Set((links ?? []).map((row) => String((row as { request_id: string }).request_id))),
    ];
    if (requestIds.length === 0) return owners;
    const { data: requests, error: reqError } = await this.admin
      .from("fm_requests")
      .select("id, code")
      .eq("organisation_id", this.organisationId)
      .in("id", requestIds);
    if (reqError) throwDb(reqError, "Unable to load incident link owners.");
    const codeById = new Map(
      (requests ?? []).map((row) => [
        String((row as { id: string }).id),
        String((row as { code: string }).code),
      ])
    );
    for (const row of links ?? []) {
      const rec = row as { incident_ref: string; request_id: string };
      const code = codeById.get(rec.request_id);
      if (code) owners.set(String(rec.incident_ref).toLowerCase(), code);
    }
    return owners;
  }
}
