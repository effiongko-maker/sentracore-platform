/** How the Request-derived part of the Issues lens was obtained. */
export type RequestsSource = "ok" | "restricted" | "unavailable";

/**
 * A subtle indication that the visible Issues exclude Request-derived records because of the operator's ACCESS
 * SCOPE (no requests.view). It is deliberately distinct from a failed load ("unavailable", which has its own notice
 * and a Retry): restricted is not unavailable. It carries no count, title or any other Request metadata — not even
 * whether any Request exists — and it is absent when the operator can read Requests.
 */
export function restrictedRequestsNotice(source: RequestsSource): string | null {
  return source === "restricted"
    ? "This view excludes Request-based Issues, which are outside your access scope."
    : null;
}
