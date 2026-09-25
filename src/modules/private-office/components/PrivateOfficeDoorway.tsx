import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** The only Private Office surface inside the executive console: a door, with no content or counts. */
export function PrivateOfficeDoorway() {
  return (
    <div className="scc-private-office-door">
      <Link href="/command-centre/private-office" className="scc-private-office-door-link">
        <span className="scc-private-office-door-title">Private Office</span>
        <span className="scc-private-office-door-sub">Your confidential personal workspace</span>
        <span className="scc-private-office-door-action">Enter <ArrowRight className="h-4 w-4" aria-hidden /></span>
      </Link>
    </div>
  );
}
