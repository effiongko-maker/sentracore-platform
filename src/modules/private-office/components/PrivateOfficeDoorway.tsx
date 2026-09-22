import Link from "next/link";

/** The only Private Office surface inside the executive console: a door, with no content or counts. */
export function PrivateOfficeDoorway() {
  return (
    <div className="scc-private-office-door">
      <Link href="/command-centre/private-office" className="scc-private-office-door-link">
        Private Office
        <span className="scc-private-office-door-sub">Private executive workspace</span>
      </Link>
    </div>
  );
}
