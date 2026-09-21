import Link from "next/link";

/**
 * Batcave V1 — an intentionally empty private foundation. It stores and shows nothing yet;
 * future private capabilities will each require their own explicit design and authority.
 */
export function BatcavePage() {
  return (
    <div className="scc scc-batcave">
      <header className="scc-batcave-head">
        <p className="scc-eyebrow">Command Centre · Batcave</p>
        <h1 className="scc-batcave-title">Batcave</h1>
        <p className="scc-lede">Private executive workspace.</p>
      </header>
      <section className="scc-panel scc-batcave-body" aria-label="Foundation state">
        <p className="scc-batcave-note">
          This workspace is at its foundation stage. It holds no information yet.
        </p>
      </section>
      <p className="scc-batcave-back">
        <Link href="/command-centre" className="scc-panel-link">
          Back to Command Centre
        </Link>
      </p>
    </div>
  );
}
