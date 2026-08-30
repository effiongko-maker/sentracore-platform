/**
 * Verifies the real recovery redirect failure shapes are rescued to /reset-password.
 * Does NOT mutate passwords. Does NOT use the real user email for generateLink.
 *
 * Asserts pathname === "/auth/callback" mid-flight where observable, then
 * pathname === "/reset-password" with the Reset Password form visible.
 */
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");
const { readFileSync } = require("fs");

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";

function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      )
        v = v.slice(1, -1);
      env[t.slice(0, i).trim()] = v;
    }
  } catch {
    /* optional */
  }
  return env;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function pathOf(page) {
  return new URL(page.url()).pathname;
}

function redact(href) {
  return String(href)
    .replace(/access_token=[^&#]+/g, "access_token=[REDACTED]")
    .replace(/refresh_token=[^&#]+/g, "refresh_token=[REDACTED]")
    .replace(/token=[^&#]+/g, "token=[REDACTED]");
}

async function main() {
  const env = loadEnv();
  const results = [];
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const stamp = Date.now();
  const email = `sc-rescue-${stamp}@mailinator.com`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: `Rescue-${stamp}-Aa1!`,
    email_confirm: true,
  });
  if (error) throw error;
  const userId = created.user.id;

  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  });
  const page = await browser.newPage();

  try {
    // --- A: Site URL fallback (the real manual failure) ---
    // Build a live recovery hash via generateLink → verify, then drop tokens onto `/`.
    const { data: linkData, error: linkErr } =
      await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${BASE}/auth/callback` },
      });
    if (linkErr) throw linkErr;
    const verifyRes = await fetch(linkData.properties.action_link, {
      redirect: "manual",
    });
    const loc = verifyRes.headers.get("location");
    assert(loc, "missing verify Location");
    const verified = new URL(loc);
    assert(
      verified.hash.includes("type=recovery"),
      "verify redirect missing type=recovery hash"
    );
    const siteUrlLanding = `${BASE}/${verified.hash}`;
    console.log("A_landing", redact(siteUrlLanding));

    const pathSamples = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        pathSamples.push(new URL(frame.url()).pathname);
      }
    });

    await page.goto(siteUrlLanding, { waitUntil: "domcontentloaded" });
    // Expect rescue via /login catcher → /auth/callback → /reset-password
    await page.waitForURL(
      (u) => new URL(u).pathname === "/reset-password",
      { timeout: 25000 }
    );
    assert(
      pathSamples.includes("/auth/callback") ||
        pathSamples.includes("/login") /* catcher runs on login */,
      `expected callback or login in hops, got ${pathSamples.join(" → ")}`
    );
    assert(pathOf(page) === "/reset-password", `expected /reset-password got ${pathOf(page)}`);
    await page.waitForSelector("#password", { timeout: 10000 });
    assert(
      (await page.getByText("Set a new password").count()) > 0,
      "Reset Password heading missing"
    );
    results.push(
      `PASS Site-URL hash rescue → hops=${pathSamples.join("→")} final=${pathOf(page)} form=visible`
    );

    // STOP here for this user — do not submit a new password.
    await page.context().clearCookies();

    // --- B: Direct /auth/callback with hash (intended path) ---
    const { data: link2, error: e2 } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${BASE}/auth/callback` },
    });
    if (e2) throw e2;
    const v2 = await fetch(link2.properties.action_link, { redirect: "manual" });
    const loc2 = v2.headers.get("location");
    const hopsB = [];
    page.removeAllListeners("framenavigated");
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) hopsB.push(new URL(frame.url()).pathname);
    });
    await page.goto(loc2, { waitUntil: "domcontentloaded" });
    await page.waitForURL((u) => new URL(u).pathname === "/reset-password", {
      timeout: 25000,
    });
    assert(hopsB.includes("/auth/callback"), "B missing /auth/callback hop");
    assert(pathOf(page) === "/reset-password", "B not on reset-password");
    await page.waitForSelector("#password", { timeout: 10000 });
    results.push(
      `PASS direct callback → hops=${hopsB.join("→")} final=${pathOf(page)} form=visible`
    );

    // --- C: Ensure we never assert success via url.includes ---
    assert(
      !page.url().includes("/login"),
      "must not finish on login"
    );
    results.push("PASS final URL is not /login");
  } finally {
    await browser.close();
    await admin.auth.admin.deleteUser(userId);
  }

  console.log("\n=== recovery redirect rescue verify ===");
  for (const line of results) console.log(line);
  console.log("=== done (no password mutation) ===\n");
}

main().catch((err) => {
  console.error("FAIL", err.message);
  process.exit(1);
});
