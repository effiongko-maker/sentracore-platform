/**
 * Command Centre presentation DTOs — composition/read layer only.
 * Domain records remain authoritative in Finance / ECC / FM services.
 */

export type CommandCentreSurfaceState =
  | "healthy"
  | "empty"
  | "unavailable"
  | "error"
  | "restricted";

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
};

export type CommandCentreDecisionItem = {
  id: string;
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

export type CommandCentreProfilePresentation = {
  displayName: string;
  jobTitle: string | null;
  avatarUrl: string | null;
  initials: string;
};

export type CommandCentreSnapshot = {
  asOf: string;
  greeting: string;
  lede: string;
  profile: CommandCentreProfilePresentation;
  pulse: CommandCentrePulseCard[];
  decisions: {
    state: CommandCentreSurfaceState;
    items: CommandCentreDecisionItem[];
    viewAllHref: string | null;
  };
  attention: {
    state: CommandCentreSurfaceState;
    items: CommandCentreAttentionItem[];
  };
  lastVisit: {
    state: "unavailable";
    message: string;
    detail: string;
  };
  assignments: {
    state: "unavailable";
    message: string;
    detail: string;
  };
  askSentraCore: {
    state: "unavailable";
    prompt: string;
    suggestions: string[];
  };
};
