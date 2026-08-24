"use client";

/**
 * OEM attribution for the left navigation shell.
 * Always rendered at the bottom of OrganisationalCompass — not in page content.
 */
export function AppFooter() {
  return (
    <footer className="os-compass-attribution" role="contentinfo">
      <p className="os-compass-attribution-name">SentraCore</p>
      <p className="os-compass-attribution-product">Operating System</p>
      <p className="os-compass-attribution-powered">Powered by</p>
      <p className="os-compass-attribution-beacon">Beacon Africa</p>
    </footer>
  );
}
