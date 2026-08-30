"use client";

import Image from "next/image";
import { Headphones } from "lucide-react";

export function SubmitRequestChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="sr-page">
      <header className="sr-header">
        <div className="sr-header-brand">
          <div className="sr-paychex-mark">
            <Image
              src="/brand/paychex-logo.jpg"
              alt=""
              width={96}
              height={22}
              priority
            />
            <span className="sr-paychex-word">PayChex</span>
          </div>
        </div>
        <a className="sr-header-help" href="mailto:facilities@paychexng.com">
          <Headphones aria-hidden />
          <span>Need help?</span>
        </a>
      </header>
      {children}
      <footer className="sr-footer">
        <p>
          <strong>PayChex</strong> | SentraCore Powered by Beacon Africa
        </p>
        <p>© {new Date().getFullYear()} PayChex. All rights reserved.</p>
      </footer>
    </div>
  );
}
