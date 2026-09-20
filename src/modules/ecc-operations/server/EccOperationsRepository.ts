import { createAdminClient } from "@/utils/supabase/admin";
import type {
  EccCentre,
  EccDailyOpsRecord,
  EccIssue,
  EccIssueHistoryEntry,
  EccRequest,
  EccRequestHistoryEntry,
} from "@/modules/ecc-operations/types";
import { DEFAULT_ECC_CENTRE } from "@/modules/ecc-operations/types";
import { mapUniqueViolation } from "@/modules/ecc-operations/server/validation";
import {
  centreToDto,
  centreToRow,
  dailyOpsToDto,
  dailyOpsToRow,
  defaultCentreDto,
  issueHistoryToDto,
  issueHistoryToRow,
  issueToDto,
  issueToRow,
  requestHistoryToDto,
  requestHistoryToRow,
  requestToDto,
  requestToRow,
  type EccCentreRow,
  type EccDailyOpsRow,
  type EccIssueHistoryRow,
  type EccIssueRow,
  type EccRequestHistoryRow,
  type EccRequestRow,
} from "./mappers";

export type EccOrgAggregate = {
  centre: EccCentre;
  dailyOps: EccDailyOpsRecord[];
  issues: EccIssue[];
  requests: EccRequest[];
};

function db() {
  return createAdminClient();
}

function throwDb(error: { code?: string; message?: string } | null, fallback: string): never {
  throw mapUniqueViolation(error, fallback);
}

export class EccOperationsRepository {
  constructor(private readonly organisationId: string) {}

  async ensureDefaultCentre(): Promise<EccCentre> {
    const existing = await this.getCentre(DEFAULT_ECC_CENTRE.id);
    if (existing) return existing;
    const row = centreToRow(this.organisationId, DEFAULT_ECC_CENTRE);
    const { error } = await db().from("ecc_centres").insert(row);
    if (error) throwDb(error, "Failed to create ECC centre.");
    return { ...DEFAULT_ECC_CENTRE };
  }

  async getCentre(centreId: string): Promise<EccCentre | null> {
    const { data, error } = await db()
      .from("ecc_centres")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("id", centreId)
      .maybeSingle();
    if (error) throwDb(error, "Failed to load ECC centre.");
    return data ? centreToDto(data as EccCentreRow) : null;
  }

  async upsertCentre(centre: EccCentre): Promise<EccCentre> {
    const row = centreToRow(this.organisationId, centre);
    const { error } = await db()
      .from("ecc_centres")
      .upsert(row, { onConflict: "organisation_id,id" });
    if (error) throwDb(error, "Failed to save ECC centre.");
    return centre;
  }

  async loadAggregate(centreId?: string): Promise<EccOrgAggregate> {
    await this.ensureDefaultCentre();
    const centre =
      (centreId ? await this.getCentre(centreId) : null) ??
      (await this.getCentre(DEFAULT_ECC_CENTRE.id)) ??
      defaultCentreDto();

    const [dailyOps, issues, requests] = await Promise.all([
      this.listDailyOps(centreId),
      this.listIssues(centreId),
      this.listRequests(centreId),
    ]);

    return { centre, dailyOps, issues, requests };
  }

  private async loadLinkMaps(): Promise<{
    issuesByDaily: Map<string, string[]>;
    requestsByDaily: Map<string, string[]>;
  }> {
    const supabase = db();
    const [issueLinks, requestLinks] = await Promise.all([
      supabase
        .from("ecc_daily_ops_issue_links")
        .select("daily_ops_id, issue_id")
        .eq("organisation_id", this.organisationId),
      supabase
        .from("ecc_daily_ops_request_links")
        .select("daily_ops_id, request_id")
        .eq("organisation_id", this.organisationId),
    ]);
    if (issueLinks.error) throwDb(issueLinks.error, "Failed to load issue links.");
    if (requestLinks.error) {
      throwDb(requestLinks.error, "Failed to load request links.");
    }

    const issuesByDaily = new Map<string, string[]>();
    for (const row of issueLinks.data ?? []) {
      const list = issuesByDaily.get(row.daily_ops_id) ?? [];
      list.push(row.issue_id);
      issuesByDaily.set(row.daily_ops_id, list);
    }
    const requestsByDaily = new Map<string, string[]>();
    for (const row of requestLinks.data ?? []) {
      const list = requestsByDaily.get(row.daily_ops_id) ?? [];
      list.push(row.request_id);
      requestsByDaily.set(row.daily_ops_id, list);
    }
    return { issuesByDaily, requestsByDaily };
  }

  async listDailyOps(centreId?: string): Promise<EccDailyOpsRecord[]> {
    let query = db()
      .from("ecc_daily_ops")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .order("recorded_at", { ascending: false });
    if (centreId) query = query.eq("centre_id", centreId);
    const { data, error } = await query;
    if (error) throwDb(error, "Failed to list daily ops.");
    const { issuesByDaily, requestsByDaily } = await this.loadLinkMaps();
    return (data as EccDailyOpsRow[] | null)?.map((row) =>
      dailyOpsToDto(
        row,
        issuesByDaily.get(row.id) ?? [],
        requestsByDaily.get(row.id) ?? []
      )
    ) ?? [];
  }

  async getDailyOps(id: string): Promise<EccDailyOpsRecord | null> {
    const { data, error } = await db()
      .from("ecc_daily_ops")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("id", id)
      .maybeSingle();
    if (error) throwDb(error, "Failed to load daily ops.");
    if (!data) return null;
    const { issuesByDaily, requestsByDaily } = await this.loadLinkMaps();
    return dailyOpsToDto(
      data as EccDailyOpsRow,
      issuesByDaily.get(id) ?? [],
      requestsByDaily.get(id) ?? []
    );
  }

  /**
   * Lookup used for morning/evening uniqueness (org + centre + period + date).
   * Ad hoc is unconstrained and should not call this for conflict decisions.
   */
  async findDailyOpsByPeriodDate(
    centreId: string,
    period: "morning" | "evening",
    reportingDate: string
  ): Promise<EccDailyOpsRecord | null> {
    const { data, error } = await db()
      .from("ecc_daily_ops")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("centre_id", centreId)
      .eq("period", period)
      .eq("reporting_date", reportingDate)
      .maybeSingle();
    if (error) throwDb(error, "Failed to look up daily ops by period and date.");
    if (!data) return null;
    const row = data as EccDailyOpsRow;
    const { issuesByDaily, requestsByDaily } = await this.loadLinkMaps();
    return dailyOpsToDto(
      row,
      issuesByDaily.get(row.id) ?? [],
      requestsByDaily.get(row.id) ?? []
    );
  }

  async insertDailyOps(record: EccDailyOpsRecord): Promise<EccDailyOpsRecord> {
    await this.ensureDefaultCentre();
    const { error } = await db()
      .from("ecc_daily_ops")
      .insert(dailyOpsToRow(this.organisationId, record));
    if (error) throwDb(error, "Failed to create daily ops.");
    return { ...record, linkedIssueIds: [], linkedRequestIds: [] };
  }

  async linkIssueToDailyOps(dailyOpsId: string, issueId: string): Promise<void> {
    const { error } = await db().from("ecc_daily_ops_issue_links").insert({
      organisation_id: this.organisationId,
      daily_ops_id: dailyOpsId,
      issue_id: issueId,
    });
    if (error) throwDb(error, "Failed to link issue to daily ops.");
  }

  async linkRequestToDailyOps(
    dailyOpsId: string,
    requestId: string
  ): Promise<void> {
    const { error } = await db().from("ecc_daily_ops_request_links").insert({
      organisation_id: this.organisationId,
      daily_ops_id: dailyOpsId,
      request_id: requestId,
    });
    if (error) throwDb(error, "Failed to link request to daily ops.");
  }

  async listIssues(centreId?: string): Promise<EccIssue[]> {
    let query = db()
      .from("ecc_issues")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .order("updated_at", { ascending: false });
    if (centreId) query = query.eq("centre_id", centreId);
    const { data, error } = await query;
    if (error) throwDb(error, "Failed to list issues.");
    const rows = (data as EccIssueRow[] | null) ?? [];
    const historyByIssue = await this.loadIssueHistoryMap(
      rows.map((row) => row.id)
    );
    return rows.map((row) => issueToDto(row, historyByIssue.get(row.id) ?? []));
  }

  async getIssue(id: string): Promise<EccIssue | null> {
    const { data, error } = await db()
      .from("ecc_issues")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("id", id)
      .maybeSingle();
    if (error) throwDb(error, "Failed to load issue.");
    if (!data) return null;
    const history = await this.listIssueHistory(id);
    return issueToDto(data as EccIssueRow, history);
  }

  async findIssueBySourceSection(
    dailyOpsId: string,
    section: string
  ): Promise<EccIssue | null> {
    const { data, error } = await db()
      .from("ecc_issues")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("source_daily_ops_id", dailyOpsId)
      .eq("source_daily_ops_section", section)
      .maybeSingle();
    if (error) throwDb(error, "Failed to look up issue by source section.");
    if (!data) return null;
    const history = await this.listIssueHistory(data.id);
    return issueToDto(data as EccIssueRow, history);
  }

  private async loadIssueHistoryMap(
    issueIds: string[]
  ): Promise<Map<string, EccIssueHistoryEntry[]>> {
    const map = new Map<string, EccIssueHistoryEntry[]>();
    if (issueIds.length === 0) return map;
    const { data, error } = await db()
      .from("ecc_issue_history")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .in("issue_id", issueIds)
      .order("at", { ascending: true });
    if (error) throwDb(error, "Failed to load issue history.");
    for (const row of (data as EccIssueHistoryRow[] | null) ?? []) {
      const list = map.get(row.issue_id) ?? [];
      list.push(issueHistoryToDto(row));
      map.set(row.issue_id, list);
    }
    return map;
  }

  async listIssueHistory(issueId: string): Promise<EccIssueHistoryEntry[]> {
    const { data, error } = await db()
      .from("ecc_issue_history")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("issue_id", issueId)
      .order("at", { ascending: true });
    if (error) throwDb(error, "Failed to load issue history.");
    return ((data as EccIssueHistoryRow[] | null) ?? []).map(issueHistoryToDto);
  }

  async insertIssue(
    issue: EccIssue,
    historyEntries?: EccIssueHistoryEntry[]
  ): Promise<EccIssue> {
    await this.ensureDefaultCentre();
    const { error } = await db()
      .from("ecc_issues")
      .insert(issueToRow(this.organisationId, issue));
    if (error) throwDb(error, "Failed to create issue.");
    const entries = historyEntries ?? issue.history;
    if (entries.length > 0) {
      await this.appendIssueHistory(issue.id, entries);
    }
    return { ...issue, history: entries };
  }

  async updateIssue(issue: EccIssue): Promise<EccIssue> {
    const row = issueToRow(this.organisationId, issue);
    const patch = {
      centre_id: row.centre_id,
      occurred_at: row.occurred_at,
      classification: row.classification,
      severity: row.severity,
      title: row.title,
      description: row.description,
      status: row.status,
      reporter_name: row.reporter_name,
      current_owner_name: row.current_owner_name,
      resolution_notes: row.resolution_notes,
      closed_at: row.closed_at,
      closed_by_name: row.closed_by_name,
      closed_by_profile_id: row.closed_by_profile_id,
      related_ecc_request_id: row.related_ecc_request_id,
      source_daily_ops_id: row.source_daily_ops_id,
      source_daily_ops_section: row.source_daily_ops_section,
      facility_id: row.facility_id,
      asset_id: row.asset_id,
      updated_at: row.updated_at,
    };
    const { error } = await db()
      .from("ecc_issues")
      .update(patch)
      .eq("organisation_id", this.organisationId)
      .eq("id", issue.id);
    if (error) throwDb(error, "Failed to update issue.");
    return issue;
  }

  async appendIssueHistory(
    issueId: string,
    entries: EccIssueHistoryEntry[]
  ): Promise<void> {
    if (entries.length === 0) return;
    const rows = entries.map((entry) =>
      issueHistoryToRow(this.organisationId, issueId, entry)
    );
    const { error } = await db().from("ecc_issue_history").insert(rows);
    if (error) throwDb(error, "Failed to append issue history.");
  }

  async deleteIssue(id: string): Promise<void> {
    // Junction rows cascade; clear request.related_ecc_issue_id first.
    const { error: clearError } = await db()
      .from("ecc_requests")
      .update({ related_ecc_issue_id: null })
      .eq("organisation_id", this.organisationId)
      .eq("related_ecc_issue_id", id);
    if (clearError) throwDb(clearError, "Failed to clear request issue links.");

    const { error } = await db()
      .from("ecc_issues")
      .delete()
      .eq("organisation_id", this.organisationId)
      .eq("id", id);
    if (error) throwDb(error, "Failed to delete issue.");
  }

  async listRequests(centreId?: string): Promise<EccRequest[]> {
    let query = db()
      .from("ecc_requests")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .order("updated_at", { ascending: false });
    if (centreId) query = query.eq("centre_id", centreId);
    const { data, error } = await query;
    if (error) throwDb(error, "Failed to list requests.");
    const rows = (data as EccRequestRow[] | null) ?? [];
    const historyByRequest = await this.loadRequestHistoryMap(
      rows.map((row) => row.id)
    );
    return rows.map((row) =>
      requestToDto(row, historyByRequest.get(row.id) ?? [])
    );
  }

  async getRequest(id: string): Promise<EccRequest | null> {
    const { data, error } = await db()
      .from("ecc_requests")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("id", id)
      .maybeSingle();
    if (error) throwDb(error, "Failed to load request.");
    if (!data) return null;
    const history = await this.listRequestHistory(id);
    return requestToDto(data as EccRequestRow, history);
  }

  async findRequestBySourceSection(
    dailyOpsId: string,
    section: string
  ): Promise<EccRequest | null> {
    const { data, error } = await db()
      .from("ecc_requests")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("source_daily_ops_id", dailyOpsId)
      .eq("source_daily_ops_section", section)
      .maybeSingle();
    if (error) throwDb(error, "Failed to look up request by source section.");
    if (!data) return null;
    const history = await this.listRequestHistory(data.id);
    return requestToDto(data as EccRequestRow, history);
  }

  private async loadRequestHistoryMap(
    requestIds: string[]
  ): Promise<Map<string, EccRequestHistoryEntry[]>> {
    const map = new Map<string, EccRequestHistoryEntry[]>();
    if (requestIds.length === 0) return map;
    const { data, error } = await db()
      .from("ecc_request_history")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .in("request_id", requestIds)
      .order("at", { ascending: true });
    if (error) throwDb(error, "Failed to load request history.");
    for (const row of (data as EccRequestHistoryRow[] | null) ?? []) {
      const list = map.get(row.request_id) ?? [];
      list.push(requestHistoryToDto(row));
      map.set(row.request_id, list);
    }
    return map;
  }

  async listRequestHistory(requestId: string): Promise<EccRequestHistoryEntry[]> {
    const { data, error } = await db()
      .from("ecc_request_history")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("request_id", requestId)
      .order("at", { ascending: true });
    if (error) throwDb(error, "Failed to load request history.");
    return ((data as EccRequestHistoryRow[] | null) ?? []).map(
      requestHistoryToDto
    );
  }

  async insertRequest(
    request: EccRequest,
    historyEntries?: EccRequestHistoryEntry[]
  ): Promise<EccRequest> {
    await this.ensureDefaultCentre();
    const { error } = await db()
      .from("ecc_requests")
      .insert(requestToRow(this.organisationId, request));
    if (error) throwDb(error, "Failed to create request.");
    const entries = historyEntries ?? request.history;
    if (entries.length > 0) {
      await this.appendRequestHistory(request.id, entries);
    }
    return { ...request, history: entries };
  }

  async updateRequest(request: EccRequest): Promise<EccRequest> {
    const row = requestToRow(this.organisationId, request);
    const patch = {
      centre_id: row.centre_id,
      title: row.title,
      reason: row.reason,
      description: row.description,
      origin: row.origin,
      responsibility: row.responsibility,
      priority: row.priority,
      status: row.status,
      requesting_manager_name: row.requesting_manager_name,
      current_owner_name: row.current_owner_name,
      evidence_notes: row.evidence_notes,
      resolution_notes: row.resolution_notes,
      closed_at: row.closed_at,
      closed_by_name: row.closed_by_name,
      closed_by_profile_id: row.closed_by_profile_id,
      related_ecc_issue_id: row.related_ecc_issue_id,
      source_daily_ops_id: row.source_daily_ops_id,
      source_daily_ops_section: row.source_daily_ops_section,
      facility_id: row.facility_id,
      asset_id: row.asset_id,
      updated_at: row.updated_at,
    };
    const { error } = await db()
      .from("ecc_requests")
      .update(patch)
      .eq("organisation_id", this.organisationId)
      .eq("id", request.id);
    if (error) throwDb(error, "Failed to update request.");
    return request;
  }

  async appendRequestHistory(
    requestId: string,
    entries: EccRequestHistoryEntry[]
  ): Promise<void> {
    if (entries.length === 0) return;
    const rows = entries.map((entry) =>
      requestHistoryToRow(this.organisationId, requestId, entry)
    );
    const { error } = await db().from("ecc_request_history").insert(rows);
    if (error) throwDb(error, "Failed to append request history.");
  }

  /**
   * One-time import of local ECC domain state.
   * Preserves IDs and rebuilds junction rows from link fields + sourceDailyOps.
   */
  async importLocalAggregate(input: {
    centre: EccCentre;
    dailyOps: EccDailyOpsRecord[];
    issues: EccIssue[];
    requests: EccRequest[];
  }): Promise<{
    centres: number;
    dailyOps: number;
    issues: number;
    requests: number;
    issueLinks: number;
    requestLinks: number;
  }> {
    await this.upsertCentre(input.centre);
    if (input.centre.id !== DEFAULT_ECC_CENTRE.id) {
      await this.ensureDefaultCentre();
    }

    // Insert centres referenced by records
    const centreIds = new Set<string>([input.centre.id, DEFAULT_ECC_CENTRE.id]);
    for (const row of input.dailyOps) centreIds.add(row.centreId);
    for (const row of input.issues) centreIds.add(row.centreId);
    for (const row of input.requests) centreIds.add(row.centreId);
    for (const centreId of centreIds) {
      const existing = await this.getCentre(centreId);
      if (!existing) {
        await this.upsertCentre({
          id: centreId,
          name:
            centreId === input.centre.id
              ? input.centre.name
              : DEFAULT_ECC_CENTRE.name,
          facilityId:
            centreId === input.centre.id
              ? input.centre.facilityId
              : DEFAULT_ECC_CENTRE.facilityId,
        });
      }
    }

    // Daily ops (immutable inserts; skip existing)
    let dailyOpsInserted = 0;
    for (const record of input.dailyOps) {
      const existing = await this.getDailyOps(record.id);
      if (existing) continue;
      const { error } = await db()
        .from("ecc_daily_ops")
        .insert(dailyOpsToRow(this.organisationId, record));
      if (error) throwDb(error, `Failed to import daily ops ${record.id}.`);
      dailyOpsInserted += 1;
    }

    // Issues
    let issuesInserted = 0;
    for (const issue of input.issues) {
      const existing = await this.getIssue(issue.id);
      if (existing) continue;
      const { error } = await db()
        .from("ecc_issues")
        .insert(issueToRow(this.organisationId, issue));
      if (error) throwDb(error, `Failed to import issue ${issue.id}.`);
      if (issue.history.length > 0) {
        await this.appendIssueHistory(issue.id, issue.history);
      }
      issuesInserted += 1;
    }

    // Requests
    let requestsInserted = 0;
    for (const request of input.requests) {
      const existing = await this.getRequest(request.id);
      if (existing) continue;
      const { error } = await db()
        .from("ecc_requests")
        .insert(requestToRow(this.organisationId, request));
      if (error) throwDb(error, `Failed to import request ${request.id}.`);
      if (request.history.length > 0) {
        await this.appendRequestHistory(request.id, request.history);
      }
      requestsInserted += 1;
    }

    // Rebuild junctions from linked* arrays and sourceDailyOps fields
    const issueLinkKeys = new Set<string>();
    const requestLinkKeys = new Set<string>();

    for (const record of input.dailyOps) {
      for (const issueId of record.linkedIssueIds ?? []) {
        issueLinkKeys.add(`${record.id}::${issueId}`);
      }
      for (const requestId of record.linkedRequestIds ?? []) {
        requestLinkKeys.add(`${record.id}::${requestId}`);
      }
    }
    for (const issue of input.issues) {
      if (issue.sourceDailyOpsId) {
        issueLinkKeys.add(`${issue.sourceDailyOpsId}::${issue.id}`);
      }
    }
    for (const request of input.requests) {
      if (request.sourceDailyOpsId) {
        requestLinkKeys.add(`${request.sourceDailyOpsId}::${request.id}`);
      }
    }

    let issueLinks = 0;
    for (const key of issueLinkKeys) {
      const [dailyOpsId, issueId] = key.split("::");
      if (!dailyOpsId || !issueId) continue;
      const dailyExists = await this.getDailyOps(dailyOpsId);
      const issueExists = await this.getIssue(issueId);
      if (!dailyExists || !issueExists) continue;
      const { error } = await db()
        .from("ecc_daily_ops_issue_links")
        .upsert(
          {
            organisation_id: this.organisationId,
            daily_ops_id: dailyOpsId,
            issue_id: issueId,
          },
          { onConflict: "organisation_id,daily_ops_id,issue_id" }
        );
      if (error) throwDb(error, "Failed to import issue junction link.");
      issueLinks += 1;
    }

    let requestLinks = 0;
    for (const key of requestLinkKeys) {
      const [dailyOpsId, requestId] = key.split("::");
      if (!dailyOpsId || !requestId) continue;
      const dailyExists = await this.getDailyOps(dailyOpsId);
      const requestExists = await this.getRequest(requestId);
      if (!dailyExists || !requestExists) continue;
      const { error } = await db()
        .from("ecc_daily_ops_request_links")
        .upsert(
          {
            organisation_id: this.organisationId,
            daily_ops_id: dailyOpsId,
            request_id: requestId,
          },
          { onConflict: "organisation_id,daily_ops_id,request_id" }
        );
      if (error) throwDb(error, "Failed to import request junction link.");
      requestLinks += 1;
    }

    // Verify counts after import
    const [dailyOps, issues, requests] = await Promise.all([
      this.listDailyOps(),
      this.listIssues(),
      this.listRequests(),
    ]);
    const expectedIssueIds = new Set(input.issues.map((row) => row.id));
    const expectedRequestIds = new Set(input.requests.map((row) => row.id));
    const expectedDailyIds = new Set(input.dailyOps.map((row) => row.id));
    for (const id of expectedDailyIds) {
      if (!dailyOps.some((row) => row.id === id)) {
        throw new Error(`Import verification failed: missing daily ops ${id}.`);
      }
    }
    for (const id of expectedIssueIds) {
      if (!issues.some((row) => row.id === id)) {
        throw new Error(`Import verification failed: missing issue ${id}.`);
      }
    }
    for (const id of expectedRequestIds) {
      if (!requests.some((row) => row.id === id)) {
        throw new Error(`Import verification failed: missing request ${id}.`);
      }
    }

    return {
      centres: centreIds.size,
      dailyOps: dailyOpsInserted,
      issues: issuesInserted,
      requests: requestsInserted,
      issueLinks,
      requestLinks,
    };
  }
}
