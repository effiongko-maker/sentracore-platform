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
  | "operations"
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
};

export type CommandCentreChangeItem = {
  id: string;
  sourceId: string;
  sourceType: "finance_request_event" | "finance_audit_event" | "ecc_audit_event";
  title: string;
  detail: string;
  sourceLabel: "Finance" | "ECC";
  occurredAt: string;
  timeLabel: string;
  href: string | null;
};

export type CommandCentreDecisionItem = {
  id: string;
  source: "finance_request" | "vendor_bill";
  decisionLabel: "Financial Request" | "Vendor Bill";
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
};
