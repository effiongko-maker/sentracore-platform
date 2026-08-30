"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_RECOVERY_COOKIE,
  resolveAppOrigin,
  safeInternalPath,
} from "@/lib/auth/urls";

export type SignInState = {
  error?: string;
};

export type ForgotPasswordState = {
  error?: string;
  submitted?: boolean;
};

export type ResetPasswordState = {
  error?: string;
  success?: boolean;
};

export async function signIn(
  _prev: SignInState,
  formData: FormData
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const nextPath = String(formData.get("next") ?? "/");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Do not collapse transport failures into "invalid credentials".
    const message = error.message?.toLowerCase() ?? "";
    const isTransportFailure =
      error.name === "AuthRetryableFetchError" ||
      message.includes("fetch failed") ||
      message.includes("network") ||
      message.includes("timeout") ||
      (typeof error.status === "number" && error.status >= 500);

    console.error("[auth.signIn]", {
      name: error.name,
      message: error.message,
      status: error.status,
      code: (error as { code?: string }).code,
    });

    if (isTransportFailure) {
      return {
        error:
          "Unable to reach the authentication service. Please try again in a moment.",
      };
    }

    return { error: "Invalid email or password." };
  }

  // Clear any leftover recovery gate from a prior incomplete reset.
  cookieStore.delete(PASSWORD_RECOVERY_COOKIE);

  redirect(safeInternalPath(nextPath, "/"));
}

export async function signOut() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  cookieStore.delete(PASSWORD_RECOVERY_COOKIE);
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Request a password-recovery email via Supabase.
 * Always returns the same confirmation UI — does not reveal whether the email exists.
 */
export async function requestPasswordReset(
  _prev: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email address." };
  }

  const cookieStore = await cookies();
  const headerStore = await headers();
  const supabase = createClient(cookieStore);
  const origin = resolveAppOrigin(headerStore);
  const redirectTo = `${origin}/auth/callback`;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    const message = error.message?.toLowerCase() ?? "";
    const isTransportFailure =
      error.name === "AuthRetryableFetchError" ||
      message.includes("fetch failed") ||
      message.includes("network") ||
      message.includes("timeout") ||
      (typeof error.status === "number" && error.status >= 500);

    console.error("[auth.requestPasswordReset]", {
      name: error.name,
      message: error.message,
      status: error.status,
      code: (error as { code?: string }).code,
    });

    if (isTransportFailure) {
      return {
        error:
          "Unable to reach the authentication service. Please try again in a moment.",
      };
    }

    // Still show neutral success for most Auth API errors to avoid account enumeration.
    // Transport failures are the only case where we surface a distinct message.
  }

  return { submitted: true };
}

/**
 * Set a new password using the recovery session established by /auth/callback.
 * Session update runs on the browser client; this action only authorizes via the
 * recovery cookie and clears the gate afterward.
 */
export async function assertPasswordRecoveryContext(): Promise<ResetPasswordState> {
  const cookieStore = await cookies();
  const recovery = cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value;
  if (recovery !== "1") {
    return {
      error:
        "This password reset link is invalid or has expired. Please request a new one.",
    };
  }
  return {};
}

export async function finalizePasswordReset(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(PASSWORD_RECOVERY_COOKIE);
  const supabase = createClient(cookieStore);
  await supabase.auth.signOut();
}

/**
 * @deprecated Prefer client updateUser + finalizePasswordReset.
 * Kept for direct server updates when a server session is available.
 */
export async function updatePassword(
  _prev: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  const gate = await assertPasswordRecoveryContext();
  if (gate.error) return gate;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error:
        "This password reset link is invalid or has expired. Please request a new one.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error("[auth.updatePassword]", {
      name: error.name,
      message: error.message,
      status: error.status,
      code: (error as { code?: string }).code,
    });

    const message = error.message?.toLowerCase() ?? "";
    if (message.includes("same") || message.includes("different")) {
      return { error: "Choose a password that is different from your current one." };
    }
    if (message.includes("weak") || message.includes("least")) {
      return {
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      };
    }

    return {
      error:
        "Unable to update your password. The reset link may have expired — please request a new one.",
    };
  }

  await finalizePasswordReset();
  redirect("/login?reset=success");
}
