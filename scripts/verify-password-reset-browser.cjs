/**
 * Browser verification for password-reset UI (Playwright).
 *
 * CRITICAL RULES:
 * - Assert pathname === expected (never url.includes("next=/…"))
 * - NEVER call updateUser / admin.updateUserById / change any real password
 * - Forgot-password submit only verifies confirmation UI + API acceptance
 *
 * Usage:
 *   SMOKE_BASE_URL=http://127.0.0.1:3000 node scripts/verify-password-reset-browser.cjs
 * Optional login check (read-only):
 *   SMOKE_LOGIN_EMAIL=… SMOKE_LOGIN_PASSWORD=…
 */

const { chromium } = require("playwright");

const BASE = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function pathOf(page) {
  return new URL(page.url()).pathname;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  });
  const page = await browser.newPage();
  const results = [];

  try {
    // 1) Login → Forgot password?
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    assert(pathOf(page) === "/login", `expected /login, got ${pathOf(page)}`);
    const forgot = page.getByRole("link", { name: /Forgot password/i });
    assert(await forgot.count(), "Forgot password? link missing");
    await forgot.click();
    await page.waitForURL((u) => new URL(u).pathname === "/forgot-password");
    assert(pathOf(page) === "/forgot-password", `expected /forgot-password, got ${pathOf(page)}`);
    results.push("PASS click Forgot password? → /forgot-password");

    // 2) Heading + form
    assert(
      await page.getByRole("heading", { name: "Forgot your password?" }).count() ||
        (await page.getByText("Forgot your password?").count()),
      "heading missing"
    );
    results.push("PASS forgot-password heading visible");

    // 3) Invalid empty submit blocked by HTML5 required
    await page.click('button:has-text("Send reset link")');
    const stillOnForgot = pathOf(page) === "/forgot-password";
    assert(stillOnForgot, "empty submit should stay on forgot-password");
    const confirmationBefore = await page
      .getByText("If an account exists for this email address")
      .count();
    assert(confirmationBefore === 0, "should not show confirmation before valid submit");
    results.push("PASS empty email does not show confirmation");

    // 4) Submit valid-format email → neutral confirmation (does NOT prove delivery)
    await page.fill("#email", "password-reset-smoke@example.invalid");
    await page.click('button:has-text("Send reset link")');
    await page.waitForSelector('text=If an account exists for this email address', {
      timeout: 15000,
    });
    assert(pathOf(page) === "/forgot-password", "should remain on /forgot-password after submit");
    results.push(
      "PASS confirmation UI after submit (enumeration-safe copy). Email delivery NOT verified."
    );

    // 5) Reset without recovery context
    await page.goto(`${BASE}/reset-password`, { waitUntil: "networkidle" });
    assert(pathOf(page) === "/reset-password", `expected /reset-password, got ${pathOf(page)}`);
    await page.waitForSelector("text=invalid or has expired", { timeout: 10000 });
    assert(
      await page.getByText("invalid or has expired").count(),
      "missing expired copy"
    );
    assert(
      (await page.locator("#password").count()) === 0,
      "password fields must not show without recovery context"
    );
    results.push("PASS /reset-password without recovery fails gracefully");

    // 6) Password mismatch path — only if we had recovery; we refuse to forge recovery
    //    on a real account. Document as covered by server validation in updatePassword.
    results.push(
      "SKIP password mismatch mutate path (requires disposable recovery session; not forged)"
    );

    // 7) Login still works (optional)
    const email = process.env.SMOKE_LOGIN_EMAIL;
    const password = process.env.SMOKE_LOGIN_PASSWORD;
    if (email && password) {
      await page.goto(`${BASE}/login?next=/requests`, { waitUntil: "networkidle" });
      await page.fill("#email", email);
      await page.fill("#password", password);
      await Promise.all([
        page.click('button[type="submit"]'),
        page.waitForURL(
          (u) => {
            const p = new URL(u).pathname;
            return p !== "/login";
          },
          { timeout: 30000 }
        ),
      ]);
      const p = pathOf(page);
      assert(
        p === "/requests" || p === "/",
        `login expected /requests or /, got pathname=${p} url=${page.url()}`
      );
      // Must NOT treat /login?next=/requests as success
      assert(!page.url().includes("/login"), "still on login after submit");
      assert((await page.locator("#email").count()) === 0, "login form still present");
      const me = await page.request.get(`${BASE}/api/auth/me`);
      assert(me.ok(), `/api/auth/me status ${me.status()}`);
      results.push(`PASS live login pathname=${p}, /api/auth/me ok`);

      // Authenticated nav still works
      await page.goto(`${BASE}/requests`, { waitUntil: "networkidle" });
      assert(pathOf(page) === "/requests", `nav to /requests failed, got ${pathOf(page)}`);
      assert((await page.locator("#email").count()) === 0, "login form on /requests");
      results.push("PASS authenticated /requests navigation");
    } else {
      results.push("SKIP live login (no SMOKE_LOGIN_EMAIL/PASSWORD)");
    }
  } finally {
    await browser.close();
  }

  console.log("\n=== password-reset browser verify ===");
  for (const line of results) console.log(line);
  console.log("=== done ===\n");
  console.log(
    "MANUAL REMAINING: open real inbox for a disposable account, click reset link, set password, login. Do NOT use the bootstrap account for password mutation."
  );
}

main().catch((err) => {
  console.error("FAIL", err.message);
  process.exit(1);
});
