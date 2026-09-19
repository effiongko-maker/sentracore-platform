import type { IntelligenceAuthority } from "@/lib/intelligence";

export type AuthorityPresentation = {
  /** Only true when the analysis is grounded in reconciled authoritative records. */
  live: boolean;
  /** Headline stats are real numbers only when authority was established. */
  showStats: boolean;
  label: string;
};

/**
 * The single place the UI decides what it may claim about freshness/authority.
 * "Live" wording is unreachable unless authority.state === "live" with a
 * reconciliation timestamp.
 */
export function presentAuthority(
  authority: IntelligenceAuthority
): AuthorityPresentation {
  switch (authority.state) {
    case "live":
      return authority.reconciledAt
        ? {
            live: true,
            showStats: true,
            label: "Checked against current operational records",
          }
        : { live: false, showStats: false, label: "Live analysis unavailable" };
    case "no_activity":
      return {
        live: false,
        showStats: true,
        label: "No operational activity to analyse yet",
      };
    case "history_insufficient":
      return {
        live: false,
        showStats: true,
        label: "Not enough activity history to analyse yet",
      };
    case "unavailable":
    default:
      return { live: false, showStats: false, label: "Live analysis unavailable" };
  }
}

export function statValue(
  presentation: AuthorityPresentation,
  value: number
): string {
  return presentation.showStats ? String(value) : "—";
}
