import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { isActionError } from "@/lib/actions/errors";
import { requirePrivateOfficeAccess } from "@/modules/private-office/server/requirePrivateOfficeAccess";
import { PrivateOfficeShell } from "@/modules/private-office/security/client/PrivateOfficeShell";

export const metadata: Metadata = { title: "Private Office" };
export const dynamic = "force-dynamic";

/**
 * Server-gated for every Private Office route (Overview, Accounts, Notes). Anyone without the explicit Private
 * Office grant — or outside the platform boundary — receives a plain not-found; existence is never confirmed.
 * The shell is mounted once here so moving between Private Office areas does not lock the vault.
 */
export default async function PrivateOfficeLayout({ children }: { children: ReactNode }) {
  try {
    await requirePrivateOfficeAccess();
  } catch (error) {
    if (isActionError(error) && error.code === "UNAUTHENTICATED") redirect("/login");
    notFound();
  }
  return <PrivateOfficeShell>{children}</PrivateOfficeShell>;
}
