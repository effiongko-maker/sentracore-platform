"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { CHANGE_PASSWORD_PATH, MUST_CHANGE_PASSWORD_KEY, mustChangePassword } from "@/lib/auth/passwordLifecycle";
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

  const { data: signedIn, error } = await supabase.auth.signInWithPassword({
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

  // An administrator-issued temporary credential must be replaced first; the proxy enforces this on every request,
  // this just lands the user there directly instead of on a page they cannot use.
  if (mustChangePassword(signedIn?.user)) redirect(CHANGE_PASSWORD_PATH);

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


export type ChangePasswordState = { error?: string };

/**
 * Complete the mandatory first-login password change.
 *
 * Order matters: the user's OWN session replaces the password first; only when that succeeds is the flag cleared
 * (service role — a user cannot clear it themselves). If the update fails the flag stays and access stays gated.
 * If clearing the flag fails after the password changed, the user is still gated and can simply choose another new
 * password. The password is never logged, stored or echoed.
 */
export async function completeMandatoryPasswordChange(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirm) return { error: "Passwords do not match." };

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session has ended. Please sign in again." };
  if (!mustChangePassword(user)) redirect("/");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    // Deliberately no credential in the log: only the error class.
    console.error("[auth.completeMandatoryPasswordChange]", { name: error.name, status: error.status, code: (error as { code?: string }).code });
    const message = error.message?.toLowerCase() ?? "";
    if (message.includes("same") || message.includes("different")) {
      return { error: "Choose a password that is different from your temporary password." };
    }
    if (message.includes("weak") || message.includes("least")) {
      return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters and not easily guessed.` };
    }
    return { error: "Unable to update your password. Please try again." };
  }

  const admin = createAdminClient();
  const { error: clearError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { [MUST_CHANGE_PASSWORD_KEY]: null },
  });
  if (clearError) {
    console.error("[auth.completeMandatoryPasswordChange.clear]", { name: clearError.name, status: clearError.status });
    return { error: "Your password was changed but the change could not be confirmed. Please choose a new password again." };
  }

  // Audit that the user completed the change — never the credential.
  try {
    const { data: profile } = await admin.from("profiles").select("organisation_id").eq("id", user.id).maybeSingle();
    const organisationId = (profile as { organisation_id?: string } | null)?.organisation_id;
    if (organisationId) {
      await admin.rpc("platform_iam_insert_audit_event", {
        p_organisation_id: organisationId,
        p_actor_profile_id: user.id,
        p_action: "user.password_changed",
        p_object_type: "profile",
        p_object_id: user.id,
        p_details: { via: "mandatory_first_login_change" },
      });
    }
  } catch {
    /* auditing must never expose or block the credential change */
  }

  redirect("/");
}
