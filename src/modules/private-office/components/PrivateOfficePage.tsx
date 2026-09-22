import Link from "next/link";
import { PrivateOfficeNotes } from "@/modules/private-office/components/PrivateOfficeNotes";
import type { PrivateOfficeNote } from "@/modules/private-office/notes/domain";

/**
 * Private Office — private executive workspace. First capability: private notes.
 * A failed read is shown as a failure, never as an empty notebook.
 */
export function PrivateOfficePage({
  notes,
  timeZone,
}: {
  /** null = the notes could not be loaded. */
  notes: PrivateOfficeNote[] | null;
  timeZone: string | null;
}) {
  return (
    <div className="scc scc-private-office">
      <header className="scc-private-office-head">
        <p className="scc-eyebrow">Executive Office · Private Office</p>
        <h1 className="scc-private-office-title">Private Office</h1>
        <p className="scc-lede">Private executive workspace.</p>
      </header>
      <section className="scc-panel scc-private-office-body" aria-label="Private notes workspace">
        {notes === null ? (
          <p className="scc-private-office-note" role="alert">
            Your notes could not be loaded. Please try again.
          </p>
        ) : (
          <>
            <p className="scc-private-office-note">Private to your Private Office workspace.</p>
            <PrivateOfficeNotes notes={notes} timeZone={timeZone} />
          </>
        )}
      </section>
      <p className="scc-private-office-back">
        <Link href="/command-centre" className="scc-panel-link">
          Back to Executive Office
        </Link>
      </p>
    </div>
  );
}
