import type {
  DocumentKind,
  ReportDocumentModel,
  TemplatedDocument,
  TemplatePlaceholderMap,
} from "../types";

/**
 * Default text templates with {{placeholders}}.
 * Drop-in client .docx templates will reuse the same placeholder vocabulary.
 */
const DEFAULT_TEMPLATES: Record<DocumentKind, string> = {
  executive_summary: `EXECUTIVE SUMMARY
Facility: {{facilityName}}
Period: {{reportingPeriod}}
Generated: {{generatedAt}}

Operational score: {{operationalScore}} ({{healthBand}})
{{healthSummary}}

Portfolio KPIs
- Facilities: {{totalFacilities}} (active {{activeFacilities}})
- Assets: {{totalAssets}} — availability {{assetAvailability}}
- Open work orders: {{openWorkOrders}} (overdue {{overdueWorkOrders}})
- Maintenance backlog: {{maintenanceBacklog}}
- Critical incidents: {{criticalIncidents}}
- Workforce: {{workforce}}

Major risks
{{majorRisks}}

Recommendations
{{recommendations}}
`,

  monthly_facility: `MONTHLY FACILITY REPORT
Facility: {{facilityName}}
Period: {{reportingPeriod}}
Department: {{department}}
Generated: {{generatedAt}}

Executive Summary
Operational score: {{operationalScore}}
{{healthSummary}}

Contract Performance Dashboard
- Work orders raised: {{workOrdersRaised}}
- Open work orders: {{openWorkOrders}}
- Closure rate: {{closureRate}}
- Asset availability: {{assetAvailability}}
- Critical incidents: {{criticalIncidents}}
- Maintenance backlog: {{maintenanceBacklog}}

Issues & Risks
{{majorRisks}}

Recommendations
{{recommendations}}
`,

  quarterly: `QUARTERLY REPORT
Facility: {{facilityName}}
Period: {{reportingPeriod}}
Generated: {{generatedAt}}

Quarter Overview
Operational score: {{operationalScore}}
Asset availability: {{assetAvailability}}

KPI Trends
- Work orders raised: {{workOrdersRaised}}
- Closure rate: {{closureRate}}
- Maintenance backlog: {{maintenanceBacklog}}
- Critical incidents: {{criticalIncidents}}

Major Risks
{{majorRisks}}

Recommendations
{{recommendations}}
`,

  annual: `ANNUAL STATUS REPORT
Facility: {{facilityName}}
Period: {{reportingPeriod}}
Generated: {{generatedAt}}

Annual KPIs
- Facilities: {{totalFacilities}}
- Assets: {{totalAssets}} (availability {{assetAvailability}})
- Closure rate: {{closureRate}}
- Maintenance backlog: {{maintenanceBacklog}}
- Critical incidents: {{criticalIncidents}}
- Workforce: {{workforce}}
- Operational score: {{operationalScore}}

Achievements
{{achievements}}

Operational Challenges
{{majorRisks}}

Lessons Learned
{{lessonsLearned}}

Recommendations
{{recommendations}}
`,

  maintenance: `MAINTENANCE REPORT
Facility: {{facilityName}}
Period: {{reportingPeriod}}
Generated: {{generatedAt}}

Backlog: {{maintenanceBacklog}}
Overdue: {{overdueMaintenance}}
On hold: {{maintenanceOnHold}}
Total requests: {{totalRequests}}

Risks
{{majorRisks}}

Recommendations
{{recommendations}}
`,

  work_order: `WORK ORDER REPORT
Facility: {{facilityName}}
Period: {{reportingPeriod}}
Generated: {{generatedAt}}

Raised: {{workOrdersRaised}}
Open: {{openWorkOrders}}
Overdue: {{overdueWorkOrders}}
Closure rate: {{closureRate}}
Due today: {{workOrdersDueToday}}
On hold: {{workOrdersOnHold}}

Recommendations
{{recommendations}}
`,

  incident: `INCIDENT REPORT
Facility: {{facilityName}}
Period: {{reportingPeriod}}
Generated: {{generatedAt}}

Critical incidents: {{criticalIncidents}}
Unassigned critical: {{criticalIncidentsUnassigned}}
Needing work order: {{incidentsNeedingWorkOrder}}
Total: {{totalIncidents}}

Risks
{{majorRisks}}

Recommendations
{{recommendations}}
`,

  asset: `ASSET REPORT
Facility: {{facilityName}}
Period: {{reportingPeriod}}
Generated: {{generatedAt}}

Total assets: {{totalAssets}}
Active: {{activeAssets}}
Availability: {{assetAvailability}}
Poor condition: {{assetsInPoorCondition}}

Recommendations
{{recommendations}}
`,
};

function stringifyFields(
  fields: ReportDocumentModel["fields"]
): TemplatePlaceholderMap {
  const map: TemplatePlaceholderMap = {};
  for (const [key, value] of Object.entries(fields)) {
    map[key] = value == null ? "" : String(value);
  }
  return map;
}

function applyPlaceholders(
  template: string,
  placeholders: TemplatePlaceholderMap
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    return placeholders[key] ?? "";
  });
}

/**
 * Maps document models into template placeholder bags.
 * Isolated from ReportingService and Dashboard.
 * Future: load client .docx templates and merge the same placeholder map.
 */
export const TemplateAdapter = {
  toPlaceholders(document: ReportDocumentModel): TemplatePlaceholderMap {
    const base = stringifyFields(document.fields);
    return {
      ...base,
      title: document.title,
      subtitle: document.subtitle ?? "",
      facilityName:
        base.facilityName || document.context.facilityName || "Portfolio",
      reportingPeriod: document.context.period.label,
      generatedAt: document.context.generatedAt,
      department: document.context.department ?? base.department ?? "",
      clientName: document.context.branding?.clientName ?? "",
      templateVersion: document.context.branding?.templateVersion ?? "v1",
      language: document.context.branding?.language ?? "en",
      coverLetterSubject: document.coverLetter?.subject ?? "",
      coverLetterBody: document.coverLetter?.body ?? "",
    };
  },

  apply(
    document: ReportDocumentModel,
    options?: {
      templateId?: string;
      templateVersion?: string;
      /** Override default text template (e.g. loaded from client file). */
      templateBody?: string;
    }
  ): TemplatedDocument {
    const placeholders = this.toPlaceholders(document);
    const templateId = options?.templateId ?? `default:${document.kind}`;
    const templateVersion =
      options?.templateVersion ??
      document.context.branding?.templateVersion ??
      "v1";
    const templateBody =
      options?.templateBody ?? DEFAULT_TEMPLATES[document.kind];

    return {
      kind: document.kind,
      title: document.title,
      templateId,
      templateVersion,
      placeholders,
      renderedBody: applyPlaceholders(templateBody, placeholders),
      document,
    };
  },

  listDefaultPlaceholders(kind: DocumentKind): string[] {
    const template = DEFAULT_TEMPLATES[kind];
    const keys = new Set<string>();
    for (const match of template.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
      keys.add(match[1]);
    }
    return Array.from(keys).sort();
  },
};
