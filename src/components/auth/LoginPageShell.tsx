import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  ClipboardPen,
  Settings2,
  Target,
  Users,
} from "lucide-react";
import { SentraCoreLogo } from "@/components/brand";

const LOGIN_HERO_SRC = "/auth/sentracore-operations-hero.jpg";

/**
 * Split-screen login composition matching the approved login reference.
 * Auth forms stay in children; forgot/reset continue to use AuthPageShell.
 */
export function LoginPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="login-page">
      <aside className="login-brand" aria-label="SentraCore">
        <Image
          src={LOGIN_HERO_SRC}
          alt=""
          fill
          priority
          sizes="(min-width: 960px) 46vw, 0px"
          className="login-brand-image"
        />
        <div className="login-brand-scrim" aria-hidden />
        <div className="login-brand-content">
          <div className="login-brand-top">
            <SentraCoreLogo size={40} priority alt="" />
            <div>
              <p className="login-brand-wordmark">SentraCore</p>
              <p className="login-brand-tagline">Operations, connected.</p>
            </div>
          </div>

          <div className="login-brand-mid">
            <h1 className="login-brand-headline">
              Bring your operations into focus.
            </h1>
            <p className="login-brand-lede">
              SentraCore connects people, systems and workflows so organisations
              can operate with greater clarity.
            </p>
          </div>

          <div>
            <div className="login-brand-pillars" aria-hidden>
              <div className="login-brand-pillar">
                <span className="login-brand-pillar-icon">
                  <Users className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <p className="login-brand-pillar-label">People</p>
                <p className="login-brand-pillar-sublabel">Coordinate</p>
              </div>
              <div className="login-brand-pillar">
                <span className="login-brand-pillar-icon">
                  <Settings2 className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <p className="login-brand-pillar-label">Operations</p>
                <p className="login-brand-pillar-sublabel">Execute</p>
              </div>
              <div className="login-brand-pillar">
                <span className="login-brand-pillar-icon">
                  <BarChart3 className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <p className="login-brand-pillar-label">Intelligence</p>
                <p className="login-brand-pillar-sublabel">Understand</p>
              </div>
              <div className="login-brand-pillar">
                <span className="login-brand-pillar-icon">
                  <Target className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <p className="login-brand-pillar-label">Impact</p>
                <p className="login-brand-pillar-sublabel">Improve</p>
              </div>
            </div>

            <div className="login-brand-foot">
              <p className="login-brand-foot-line">
                Clarity for better operations.
              </p>
            </div>
          </div>
        </div>
      </aside>

      <main className="login-panel">
        <p className="login-panel-eyebrow">
          Better spaces / Stronger communities
        </p>

        <div className="login-panel-inner">
          <div className="login-mobile-brand">
            <SentraCoreLogo size={36} priority alt="" />
            <div>
              <p className="login-mobile-wordmark">SentraCore</p>
              <p className="login-mobile-tagline">Operations, connected.</p>
            </div>
          </div>

          <h1 className="login-panel-title">Welcome to SentraCore</h1>
          <p className="login-panel-lede">
            Sign in to access the SentraCore platform.
          </p>

          <section className="login-staff-card" aria-labelledby="login-staff-heading">
            <h2 id="login-staff-heading" className="login-staff-title">
              Staff access
            </h2>
            <p className="login-staff-copy">
              For authorised SentraCore users.
            </p>
            {children}
          </section>

          <div className="login-divider" role="separator" aria-label="Or">
            OR
          </div>

          <section className="login-help-card" aria-labelledby="login-help-heading">
            <span className="login-help-icon" aria-hidden>
              <ClipboardPen className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <div>
              <h2 id="login-help-heading" className="login-help-title">
                Need help?
              </h2>
              <p className="login-help-copy">
                Submit a service request and our team will take it from here. No
                account required.
              </p>
            </div>
            <Link href="/occupant-requests" className="login-help-cta">
              Submit a Request
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </Link>
          </section>

          <footer className="login-footer">
            <div className="login-footer-links" aria-label="Legal">
              <span>Privacy</span>
              <span>Terms</span>
              <span>Support</span>
            </div>
            <p>© {new Date().getFullYear()} SentraCore. All rights reserved.</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
