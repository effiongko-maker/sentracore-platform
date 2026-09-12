import type { ReactNode } from "react";
import { Suspense } from "react";
import { EccWorkspaceShell } from "@/modules/ecc-operations";
import "@/styles/ecc-operations.css";

export default function EccOperationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <EccWorkspaceShell>
      <Suspense fallback={<p className="ecc-empty">Loading…</p>}>
        {children}
      </Suspense>
    </EccWorkspaceShell>
  );
}
