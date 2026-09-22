"use client";

import { Headphones } from "lucide-react";
import { FM_OPERATING_COMPANY_NAME } from "@/lib/platform/workspaces";

/**
 * Public, occupant-facing FM intake chrome — zero-tolerance for the underlying tenant identity leaking here.
 * No PayChex logo asset exists for this operating-company identity, so the mark is text-only (no image
 * fabricated). The support mailto target is left unchanged — it is a live operational inbox, not a display
 * label, and no equivalent Trivnet-routed inbox is established here.
 */
export function SubmitRequestChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="sr-page">
      <header className="sr-header">
        <div className="sr-header-brand">
          <div className="sr-paychex-mark">
            <span className="sr-paychex-word">{FM_OPERATING_COMPANY_NAME}</span>
          </div>
        </div>
        <a className="sr-header-help" href="mailto:facilities@paychexng.com">
          <Headphones aria-hidden />
          <span>Need help?</span>
        </a>
      </header>
      {children}
      <footer className="sr-footer">
        <p>
          <strong>{FM_OPERATING_COMPANY_NAME}</strong> | SentraCore™ Powered by Beacon Africa
        </p>
        <p>© {new Date().getFullYear()} {FM_OPERATING_COMPANY_NAME}. All rights reserved.</p>
      </footer>
    </div>
  );
}
