import Link from "next/link";

/** The only Batcave surface inside the executive console: a door, with no content or counts. */
export function BatcaveDoorway() {
  return (
    <div className="scc-batcave-door">
      <Link href="/command-centre/batcave" className="scc-batcave-door-link">
        Batcave
        <span className="scc-batcave-door-sub">Private executive workspace</span>
      </Link>
    </div>
  );
}
