import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isActionError } from "@/lib/actions/errors";
import { requirePrivateOfficeAccess } from "@/modules/private-office/server/requirePrivateOfficeAccess";
import { PrivateOfficeArea } from "@/modules/private-office/security/client/PrivateOfficeArea";

export const metadata: Metadata = { title: "Private Office accounts" };
export const dynamic = "force-dynamic";

export default async function PrivateOfficeAccountsRoute() {
  try {
    await requirePrivateOfficeAccess();
  } catch (error) {
    if (isActionError(error) && error.code === "UNAUTHENTICATED") redirect("/login");
    notFound();
  }
  return <PrivateOfficeArea area="accounts" />;
}
