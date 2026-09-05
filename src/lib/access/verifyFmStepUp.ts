import "server-only";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getPlatformSession } from "@/lib/auth/session";

/**
 * Re-verify the signed-in user's password via Supabase Auth.
 * Does not store passwords; does not touch Sheets / Apps Script.
 */
export async function verifyFmStepUpPassword(
  password: string
): Promise<{ ok: true } | { ok: false; reason: "missing" | "invalid" }> {
  const trimmed = String(password ?? "");
  if (!trimmed) return { ok: false, reason: "missing" };

  const session = await getPlatformSession();
  if (!session?.email) return { ok: false, reason: "invalid" };

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { error } = await supabase.auth.signInWithPassword({
    email: session.email,
    password: trimmed,
  });

  if (error) {
    console.warn("[protected.stepUp] verification failed", {
      name: error.name,
      status: error.status,
    });
    return { ok: false, reason: "invalid" };
  }

  return { ok: true };
}
