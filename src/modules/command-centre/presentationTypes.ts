import type { CommitmentView } from "@/modules/command-centre/commitments/domain";

/**
 * Command Centre presentation DTOs — composition/read layer only.
 * Domain records remain authoritative in Finance / ECC / FM services.
 */

export type CommandCentreSurfaceState =
  | "healthy"
  | "empty"
  | "unavailable"
  | "error"
  | "restricted"
  /** Some evaluation scope is missing (e.g. limited company access): zero visible items is NOT "none". */
  | "partial";

export type CommandCentrePulseDomain =
  | "finance"
  | "facility_management"
  | "ecc"
  | "projects_construction";

export type CommandCentrePulseCard = {
  domain: CommandCentrePulseDomain;
  label: string;
  state: CommandCentreSurfaceState;
  statusLabel: string;
  lines: string[];
  href: string | null;
  disabledNavigationLabel: string | null;
  /** True when part of this domain's picture could not be evaluated (a metric/source is missing). */
  partial?: boolean;
  /**
   * The line of this card that states a FINANCIAL position (e.g. Finance decisions, Facility Management pending
   * payments outstanding), when the actor may see it. null/absent = this environment states no financial position
   * for this actor (restricted, not enabled or not evaluated) — never a zero.
   */
  financialLine?: string | null;
};

export type CommandCentreChangeItem = {
  id: string;
  sourceId: string;
  sourceType: "finance_request_event" | "finance_audit_event" | "ecc_audit_event" | "fm_record_event";
  title: string;
  detail: string;
  sourceLabel: "Finance" | "ECC" | "Facility Management";
  occurredAt: string;
  timeLabel: string;
  href: string | null;
};

export type CommandCentreDecisionItem = {
  id: string;
  source: "finance_request" | "vendor_bill";
  /** Originating operating environment (provenance). Only Finance has executive (CEO) decisions today. */
  environment: "Finance";
  decisionLabel: "Financial Request" | "Vendor Bill";
  /** Current workflow state, in the source's own terms. */
  stateLabel: string;
  /** Why executive action is required. */
  reason: string;
  /** When the record entered its current review cycle (submitted), or null when the source does not record it. */
  submittedAt: string | null;
  title: string;
  reference: string | null;
  categoryLabel: string | null;
  amountLabel: string;
  currency: string;
  href: string;
};

export type CommandCentreAttentionTone = "critical" | "high" | "medium" | "info";

export type CommandCentreAttentionItem = {
  id: string;
  title: string;
  detail: string | null;
  tone: CommandCentreAttentionTone;
  href: string | null;
  sourceLabel: string;
};

/** Domains the V1 executive-attention contract evaluates. */
export type CommandCentreAttentionDomain = "finance" | "ecc" | "facility_management" | "commitments";

/**
 * How one attention domain was evaluated:
 *  loaded      — evaluated successfully (zero items is a real zero)
 *  partial     — some signals evaluated, others could not be
 *  restricted  — the domain intentionally refuses this identity (NOT a failure)
 *  unavailable — the domain could not be read (a failure)
 *  not_enabled — the domain is not enabled for the organisation
 */
export type CommandCentreDomainStatus =
  | "loaded"
  | "partial"
  | "restricted"
  | "unavailable"
  | "not_enabled";

export type CommandCentreAttentionCoverage = {
  domain: CommandCentreAttentionDomain;
  label: string;
  status: CommandCentreDomainStatus;
  note: string | null;
};

export type CommandCentreProfilePresentation = {
  displayName: string;
  jobTitle: string | null;
  avatarUrl: string | null;
  initials: string;
};

export type CommandCentreSnapshot = {
  asOf: string;
  /** Authoritative organisation IANA timezone for display; null when the organisation has none. */
  timeZone: string | null;
  greeting: string;
  lede: string;
  /** Request-time evaluation instant (the same "checked at" for every live section). */
  checkedAt: string;
  profile: CommandCentreProfilePresentation;
  pulse: CommandCentrePulseCard[];
  decisions: {
    state: CommandCentreSurfaceState;
    items: CommandCentreDecisionItem[];
    viewAllHref: string | null;
    /** Why the queue is not shown (restricted / not enabled / failed), in user language. */
    reason: string | null;
    /** Set when the actor's Finance company access covers only part of the organisation. */
    scopeNote: string | null;
  };
  attention: {
    state: CommandCentreSurfaceState;
    items: CommandCentreAttentionItem[];
    /** Qualifying items beyond the display limit. */
    hiddenCount: number;
    /** True only when every enabled attention domain was evaluated successfully. */
    complete: boolean;
    summary: string;
    coverage: CommandCentreAttentionCoverage[];
    /** Every qualifying item (the Risk & Attention lens); `items` is the Overview's bounded display. */
    allItems: CommandCentreAttentionItem[];
  };
  /**
   * Executive Commitments register for the acting executive (created/delegated + owned).
   * `restricted` means the surface is not offered to this identity — it is not a failure.
   */
  commitments: {
    state: CommandCentreSurfaceState;
    reason: string | null;
    canManage: boolean;
    currentProfileId: string;
    /** Organisation-local date the overdue derivation used; null when it could not be evaluated. */
    today: string | null;
    overdue: CommitmentView[];
    open: CommitmentView[];
    completed: CommitmentView[];
  };
  lastVisit: {
    state: CommandCentreSurfaceState;
    message: string;
    detail: string;
    /** Honest statement of which sources this feed covers. */
    scope: string;
    items: CommandCentreChangeItem[];
  };
  /** Financial Position lens — separate positions per source; never one blended total. */
  financialPosition: CommandCentreFinancialPosition;
  /** Performance lens — each environment's current position plus the throughput signals its source supports. */
  performance: CommandCentrePerformanceEnvironment[];
  /** Commitments lens — approved Finance obligations with a due date (alongside Executive Commitments). */
  obligations: CommandCentreObligations;
};

/** A value that is either known (possibly zero) or honestly not known. */
export type CommandCentreFigure =
  | { state: "known"; label: string; count?: number }
  | { state: "no_access"; label: string }
  | { state: "unavailable"; label: string };

export type CommandCentreFinancialPosition = {
  finance: {
    state: CommandCentreSurfaceState;
    reason: string | null;
    /** Coverage statement (e.g. organisation-wide Finance companies). */
    scope: string | null;
    periodLabel: string | null;
    periodStatus: "open" | "closed" | "none" | null;
    receivablesOpen: CommandCentreFigure;
    receivablesOverdue: CommandCentreFigure;
    payablesOpen: CommandCentreFigure;
    payablesOverdue: CommandCentreFigure;
    postedRevenue: CommandCentreFigure;
    postedExpenses: CommandCentreFigure;
    postedNet: CommandCentreFigure;
    unpostedItems: CommandCentreFigure;
    href: string | null;
  };
  facilityManagement: {
    state: CommandCentreSurfaceState;
    reason: string | null;
    pendingPaymentsOutstanding: CommandCentreFigure;
    href: string | null;
  };
  /** What is deliberately not part of this position. */
  exclusions: string[];
};

export type CommandCentrePerformanceEnvironment = {
  domain: CommandCentrePulseDomain;
  label: string;
  state: CommandCentreSurfaceState;
  statusLabel: string;
  /** The environment's current position (its pulse lines, unabridged). */
  position: string[];
  /** Throughput signals the source genuinely records for the current period, or a not-established statement. */
  throughput: string[];
  href: string | null;
};

export type CommandCentreObligationItem = {
  id: string;
  environment: "Finance";
  title: string;
  statusLabel: string;
  amountLabel: string;
  dueDate: string;
  overdue: boolean;
  href: string;
};

export type CommandCentreObligations = {
  state: CommandCentreSurfaceState;
  reason: string | null;
  /** Aggregate (organisation-wide Finance projection) — known even when record detail is restricted. */
  summary: string | null;
  /** Record-level items; empty when the actor lacks payable view / company access (see reason). */
  items: CommandCentreObligationItem[];
};
