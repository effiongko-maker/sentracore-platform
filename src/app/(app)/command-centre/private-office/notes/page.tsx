import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isActionError } from "@/lib/actions/errors";
import { requireOrganisationTimeZone } from "@/lib/time/organisationTime";
import { PrivateOfficePage } from "@/modules/private-office/components/PrivateOfficePage";
import { PrivateOfficeNotesService } from "@/modules/private-office/notes/server/PrivateOfficeNotesService";
import type { PrivateOfficeNote } from "@/modules/private-office/notes/domain";
import { requirePrivateOfficeAccess } from "@/modules/private-office/server/requirePrivateOfficeAccess";

export const metadata: Metadata = {
  title: "Private Notes",
};

/**
 * Server-gated. Anyone without the explicit Private Office grant (or outside the platform boundary)
 * receives a plain not-found — the page never confirms that a private workspace exists.
 */
export default async function PrivateOfficeRoute() {
  let access;
  try {
    access = await requirePrivateOfficeAccess();
  } catch (error) {
    if (isActionError(error) && error.code === "UNAUTHENTICATED") redirect("/login");
    notFound();
  }

  let notes: PrivateOfficeNote[] | null = null;
  try {
    notes = await new PrivateOfficeNotesService(access).list();
  } catch {
    notes = null; // failure ≠ empty
  }
  let timeZone: string | null = null;
  try {
    timeZone = requireOrganisationTimeZone(access.session.organisation);
  } catch {
    timeZone = null;
  }
  return <PrivateOfficePage notes={notes} timeZone={timeZone} />;
}
