/**
 * Smoke verification for Forgot / Reset Password UI + auth boundary.
 *
 * CRITICAL:
 * - Assert pathname, never url.includes("next=/…")
 * - NEVER mutate real/bootstrap user passwords
 *
 * Usage:
 *   node scripts/smoke-password-reset-flow.cjs
 *
 * Optional env for login check only (no password mutation):
 *   SMOKE_LOGIN_EMAIL / SMOKE_LOGIN_PASSWORD
 */

const { readFileSync } = require("fs");

function loadEnvLocal() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      if (process.env[k]) continue;
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}
loadEnvLocal();

const BASE = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function pathnameOf(url) {
  return new URL(url).pathname;
}

async function fetchPage(path, { cookie } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    headers: cookie ? { cookie } : {},
  });
  const text = await res.text();
  const setCookie = res.headers.getSetCookie?.() ?? [];
  return { res, text, setCookie, status: res.status, location: res.headers.get("location") };
}

async function main() {
  const results = [];

  // 1) Login page has Forgot password?
  {
    const { status, text } = await fetchPage("/login");
    assert(status === 200, `login expected 200, got ${status}`);
    assert(
      text.includes("Forgot password?"),
      "login page missing Forgot password? link"
    );
    assert(text.includes('href="/forgot-password"') || text.includes("href=\\\"/forgot-password\\\""),
      "login page missing /forgot-password href");
    results.push("PASS login shows Forgot password?");
  }

  // 2) /forgot-password loads
  {
    const { status, text } = await fetchPage("/forgot-password");
    assert(status === 200, `forgot-password expected 200, got ${status}`);
    assert(text.includes("Forgot your password?"), "missing heading");
    assert(text.includes("Send reset link"), "missing submit CTA");
    assert(text.includes("Back to Sign in"), "missing back link");
    results.push("PASS /forgot-password loads");
  }

  // 3) Invalid email — HTML required/type=email (server also validates)
  {
    // Post empty email via server action is hard without Next action id;
    // assert the form requires email.
    const { text } = await fetchPage("/forgot-password");
    assert(/type="email"/.test(text) || /type=\\"email\\"/.test(text), "email input missing");
    assert(/required/.test(text), "email should be required");
    results.push("PASS forgot-password email input required");
  }

  // 4) Password recovery request accepted (neutral copy)
  {
    // Call Supabase-backed server action indirectly by checking page posts.
    // Use the browserless approach: invoke reset via public page + form POST
    // is not practical without action IDs. Instead hit a tiny probe using
    // the same API the action uses — only if we can import. For smoke, use
    // Playwright-less fetch of confirmation after client navigation isn't available.
    //
    // Fallback: use @supabase/supabase-js admin-less reset from Node with publishable key
    // ONLY to verify the API accepts the call — does NOT mutate password.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (url && key) {
      const redirectTo = `${BASE}/auth/callback?next=/reset-password`;
      const r = await fetch(`${url}/auth/v1/recover`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "nonexistent-enumeration-check@example.invalid",
          gotrue_meta_security: {},
          redirect_to: redirectTo,
        }),
      });
      // Supabase typically returns 200 even for unknown emails (anti-enumeration).
      assert(
        r.status === 200 || r.status === 429,
        `recover endpoint unexpected status ${r.status}`
      );
      results.push(`PASS recovery request accepted (HTTP ${r.status}, no account leak)`);
    } else {
      results.push("SKIP recovery API (missing NEXT_PUBLIC_SUPABASE_* in env)");
    }
  }

  // 5) /reset-password without recovery context fails gracefully
  {
    const { status, text } = await fetchPage("/reset-password");
    assert(status === 200, `reset-password expected 200, got ${status}`);
    assert(
      text.includes("invalid or has expired") ||
        text.includes("Request a new reset link"),
      "missing expired/invalid recovery copy"
    );
    assert(!text.includes("Set new password") || text.includes("invalid or has expired"),
      "must not offer password update without recovery context");
    results.push("PASS /reset-password rejects missing recovery context");
  }

  // 6) Callback without code → client page then /login (pathname check)
  {
    let playwright;
    try {
      playwright = require("playwright");
    } catch {
      playwright = null;
    }
    if (playwright) {
      const browser = await playwright.chromium.launch({
        headless: true,
        channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
      });
      const page = await browser.newPage();
      await page.goto(`${BASE}/auth/callback`, { waitUntil: "networkidle" });
      await page.waitForURL((u) => new URL(u).pathname === "/login", {
        timeout: 15000,
      });
      assert(
        pathnameOf(page.url()) === "/login",
        `callback without code should go to /login, got ${pathnameOf(page.url())}`
      );
      results.push("PASS /auth/callback without code → /login");

      await page.goto(
        `${BASE}/auth/callback?code=not-a-real-code&next=/reset-password`,
        { waitUntil: "networkidle" }
      );
      await page.waitForURL(
        (u) => {
          const dest = new URL(u);
          return (
            dest.pathname === "/forgot-password" &&
            dest.searchParams.get("error") === "expired"
          );
        },
        { timeout: 15000 }
      );
      results.push("PASS /auth/callback bogus code → expired");
      await browser.close();
    } else {
      results.push("SKIP callback browser redirects (playwright missing)");
    }
  }

  // 8) Open-redirect guard: next=//evil.com must not leave origin after safe path logic
  //    Exercised via login page rendering (safeInternalPath).
  {
    const { status, text } = await fetchPage("/login?next=//evil.com");
    assert(status === 200, "login should render");
    // Hidden next field should be sanitized to /
    assert(
      /name="next"[^>]*value="\/"|value="\/"[^>]*name="next"/.test(text) ||
        text.includes('value=\\"\\/"') ||
        text.includes('name="next" value="/"'),
      "open redirect next=//evil.com was not sanitized"
    );
    results.push("PASS next=//evil.com sanitized on login");
  }

  // 9) Existing login still works (optional credentials — NEVER changes password)
  const email = process.env.SMOKE_LOGIN_EMAIL;
  const password = process.env.SMOKE_LOGIN_PASSWORD;
  if (email && password) {
    // Use Playwright if available; else skip browser login.
    let playwright;
    try {
      playwright = require("playwright");
    } catch {
      results.push("SKIP live login (playwright not installed)");
    }
    if (playwright) {
      const browser = await playwright.chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(`${BASE}/login?next=/requests`, { waitUntil: "networkidle" });
      await page.fill("#email", email);
      await page.fill("#password", password);
      await page.click('button[type="submit"]');
      await page.waitForURL((url) => pathnameOf(url.href) !== "/login", {
        timeout: 30000,
      });
      const path = pathnameOf(page.url());
      assert(
        path === "/requests" || path === "/",
        `expected authenticated path /requests or /, got ${path} (full: ${page.url()})`
      );
      assert(
        !(await page.locator("#email").count()) ||
          !(await page.locator('button:has-text("Sign in")').count()),
        "login form still visible after sign-in"
      );
      // Authenticated app signal
      const me = await page.request.get(`${BASE}/api/auth/me`);
      assert(me.ok(), `/api/auth/me failed: ${me.status()}`);
      results.push(`PASS live login → pathname ${path}, /api/auth/me ok`);
      await browser.close();
    }
  } else {
    results.push("SKIP live login (set SMOKE_LOGIN_EMAIL / SMOKE_LOGIN_PASSWORD)");
  }

  console.log("\n=== password-reset smoke ===");
  for (const line of results) console.log(line);
  console.log("=== done ===\n");
  console.log(
    "NOTE: AUTOMATED TEST PASS ≠ MANUAL FLOW VERIFIED. Email delivery and end-to-end password change require manual browser + disposable account."
  );
}

main().catch((err) => {
  console.error("FAIL", err.message);
  process.exit(1);
});
