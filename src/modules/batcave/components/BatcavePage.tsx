import Link from "next/link";
import { BatcaveNotes } from "@/modules/batcave/components/BatcaveNotes";
import type { BatcaveNote } from "@/modules/batcave/notes/domain";

/**
 * Batcave — private executive workspace. First capability: private notes.
 * A failed read is shown as a failure, never as an empty notebook.
 */
export function BatcavePage({
  notes,
  timeZone,
}: {
  /** null = the notes could not be loaded. */
  notes: BatcaveNote[] | null;
  timeZone: string | null;
}) {
  return (
    <div className="scc scc-batcave">
      <header className="scc-batcave-head">
        <p className="scc-eyebrow">Command Centre · Batcave</p>
        <h1 className="scc-batcave-title">Batcave</h1>
        <p className="scc-lede">Private executive workspace.</p>
      </header>
      <section className="scc-panel scc-batcave-body" aria-label="Private notes workspace">
        {notes === null ? (
          <p className="scc-batcave-note" role="alert">
            Your notes could not be loaded. Please try again.
          </p>
        ) : (
          <>
            <p className="scc-batcave-note">Private to your Batcave workspace.</p>
            <BatcaveNotes notes={notes} timeZone={timeZone} />
          </>
        )}
      </section>
      <p className="scc-batcave-back">
        <Link href="/command-centre" className="scc-panel-link">
          Back to Command Centre
        </Link>
      </p>
    </div>
  );
}
