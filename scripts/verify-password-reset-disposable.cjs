/**
 * Disposable-account E2E for password reset (NEVER touches bootstrap users).
 *
 * Covers the real Supabase recovery redirect shapes:
 * A) Implicit hash (verify → #access_token&type=recovery) — matches non-PKCE recover
 * B) token_hash OTP (custom email templates / admin generateLink hashed_token)
 *
 * Usage:
 *   node scripts/verify-password-reset-disposable.cjs
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
      ) {
        v = v.slice(1, -1);
      }
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

function searchOf(page) {
  return new URL(page.url()).search;
}

function redactUrl(raw) {
  const u = new URL(raw);
  const q = [...u.searchParams.keys()].map((k) => `${k}=[REDACTED]`).join("&");
  const h = u.hash
    ? "#" +
      [...new URLSearchParams(u.hash.slice(1)).keys()]
        .map((k) => `${k}=[REDACTED]`)
        .join("&")
    : "";
  return `${u.origin}${u.pathname}${q ? `?${q}` : ""}${h}`;
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  assert(url && serviceKey && anon, "Missing Supabase env in .env.local");

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const stamp = Date.now();
  const email = `sc-pw-reset-disposable-${stamp}@example.invalid`;
  const initialPassword = `Init-Pw-${stamp}-Aa1!`;
  const nextPassword = `Next-Pw-${stamp}-Bb2!`;
  let userId = null;
  const results = [];

  try {
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password: initialPassword,
        email_confirm: true,
      });
    if (createErr) throw createErr;
    userId = created.user.id;
    results.push(`PASS created disposable user ${email}`);

    const redirectTo = `${BASE}/auth/callback?next=/reset-password`;
    const { data: linkData, error: linkErr } =
      await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });
    if (linkErr) throw linkErr;

    const actionLink = linkData?.properties?.action_link;
    const hashedToken = linkData?.properties?.hashed_token;
    assert(actionLink, "generateLink missing action_link");
    results.push(`PASS action_link structure ${redactUrl(actionLink)}`);

    // Follow Supabase verify once to capture the app redirect (hash or query).
    const verifyRes = await fetch(actionLink, { redirect: "manual" });
    const location = verifyRes.headers.get("location");
    assert(location, "verify did not redirect");
    results.push(`PASS verify redirect structure ${redactUrl(location)}`);

    const browser = await chromium.launch({
      headless: true,
      channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    });
    const page = await browser.newPage();

    try {
      // --- Path A: implicit hash redirect (real email-style) ---
      await page.goto(location, { waitUntil: "networkidle" });
      await page.waitForURL(
        (u) => new URL(u).pathname === "/reset-password",
        { timeout: 20000 }
      );
      assert(
        pathOf(page) === "/reset-password",
        `hash flow expected /reset-password, got pathname=${pathOf(page)} search=${searchOf(page)} url=${page.url()}`
      );
      assert(
        !searchOf(page).includes("error=expired"),
        "hash flow incorrectly landed with error=expired"
      );
      results.push(
        `PASS hash/implicit recovery → pathname=${pathOf(page)} search=${searchOf(page) || "(empty)"}`
      );

      await page.waitForSelector("#password", { timeout: 15000 });

      // Mismatch rejection
      await page.fill("#password", nextPassword);
      await page.fill("#confirmPassword", nextPassword + "X");
      await page.click('button:has-text("Set new password")');
      await page.waitForSelector("text=Passwords do not match", {
        timeout: 10000,
      });
      results.push("PASS password mismatch rejected");

      // Success path
      await page.fill("#password", nextPassword);
      await page.fill("#confirmPassword", nextPassword);
      await Promise.all([
        page.click('button:has-text("Set new password")'),
        page.waitForURL((u) => new URL(u).pathname === "/login", {
          timeout: 20000,
        }),
      ]);
      assert(pathOf(page) === "/login", `expected /login, got ${pathOf(page)}`);
      assert(
        new URL(page.url()).searchParams.get("reset") === "success",
        "expected reset=success"
      );
      results.push("PASS set new password → /login?reset=success");

      await page.fill("#email", email);
      await page.fill("#password", nextPassword);
      await Promise.all([
        page.click('button[type="submit"]'),
        page.waitForURL((nav) => new URL(nav).pathname !== "/login", {
          timeout: 30000,
        }),
      ]);
      assert(!page.url().includes("/login"), `still on login: ${page.url()}`);
      results.push(`PASS login with new password (pathname=${pathOf(page)})`);

      // --- Path B: token_hash on a fresh disposable user ---
      await page.context().clearCookies();
      const stamp2 = Date.now();
      const email2 = `sc-pw-reset-th-${stamp2}@example.invalid`;
      const pw2 = `Init-Pw-${stamp2}-Aa1!`;
      const { data: created2, error: c2 } = await admin.auth.admin.createUser({
        email: email2,
        password: pw2,
        email_confirm: true,
      });
      if (c2) throw c2;
      const user2 = created2.user.id;
      try {
        const { data: link2, error: l2 } = await admin.auth.admin.generateLink({
          type: "recovery",
          email: email2,
        });
        if (l2) throw l2;
        const th = link2.properties.hashed_token;
        assert(th, "missing hashed_token");
        const callbackUrl = `${BASE}/auth/callback?token_hash=${encodeURIComponent(
          th
        )}&type=recovery&next=/reset-password`;
        await page.goto(callbackUrl, { waitUntil: "networkidle" });
        await page.waitForURL(
          (u) => new URL(u).pathname === "/reset-password",
          { timeout: 20000 }
        );
        assert(pathOf(page) === "/reset-password", "token_hash path failed");
        await page.waitForSelector("#password", { timeout: 15000 });
        results.push("PASS token_hash recovery → /reset-password");
      } finally {
        await admin.auth.admin.deleteUser(user2);
      }
    } finally {
      await browser.close();
    }

    // Old password must fail for primary disposable user
    const anonClient = createClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: oldErr } = await anonClient.auth.signInWithPassword({
      email,
      password: initialPassword,
    });
    assert(oldErr, "old password should no longer work");
    results.push("PASS old password rejected after reset");
  } finally {
    if (userId) {
      const { error: delErr } = await admin.auth.admin.deleteUser(userId);
      if (delErr) {
        results.push(`WARN failed to delete disposable user: ${delErr.message}`);
      } else {
        results.push("PASS deleted disposable user");
      }
    }
  }

  console.log("\n=== disposable password-reset E2E ===");
  for (const line of results) console.log(line);
  console.log("=== done ===\n");
  console.log(
    "NOTE: Real inbox click still required for manual acceptance. This script never mutates bootstrap users."
  );
}

main().catch((err) => {
  console.error("FAIL", err.message);
  process.exit(1);
});
