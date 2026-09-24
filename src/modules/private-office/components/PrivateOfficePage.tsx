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
        <h2 className="scc-private-office-title">Notes</h2>
        <p className="scc-lede">Owner-only notes, kept in separate access-controlled storage from your Private Office financial records.</p>
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
    </div>
  );
}
