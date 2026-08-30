"use server";

import { cookies } from "next/headers";
import { PASSWORD_RECOVERY_COOKIE } from "@/lib/auth/urls";

/** Mark the current browser as being in an in-progress password recovery. */
export async function markPasswordRecovery(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(PASSWORD_RECOVERY_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60,
  });
}
