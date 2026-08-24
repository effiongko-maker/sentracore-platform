import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

type BootstrapBody = {
  email?: string;
  password?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  /** Default: organisation_owner for PayChex */
  roleSlug?: string;
  /** Optional: also grant platform_super_admin (org-null assignment) */
  grantPlatformSuperAdmin?: boolean;
  organisationSlug?: string;
};

function unauthorized() {
  return NextResponse.json(
    { success: false, message: "Unauthorized" },
    { status: 401 }
  );
}

function badRequest(message: string) {
  return NextResponse.json({ success: false, message }, { status: 400 });
}

function isExistingUserError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("already") ||
    lower.includes("registered") ||
    lower.includes("exists")
  );
}

async function findAuthUserIdByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string
): Promise<string | null> {
  // Paginate a small search — bootstrap is a one-time admin operation.
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      throw error;
    }
    const match = data.users.find(
      (user) => user.email?.toLowerCase() === email
    );
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  return null;
}

/**
 * Controlled first-user bootstrap (server-only, secret-gated).
 *
 * Creates or resumes a Supabase Auth user, then completes tenancy/role setup
 * via privileged RPC `bootstrap_first_platform_user` (service_role only).
 *
 * Disabled once any organisation-linked profile already exists.
 */
export async function POST(request: Request) {
  const bootstrapSecret = process.env.BOOTSTRAP_SECRET;
  if (!bootstrapSecret) {
    return NextResponse.json(
      {
        success: false,
        message: "Bootstrap is not configured (BOOTSTRAP_SECRET missing).",
      },
      { status: 503 }
    );
  }

  const header =
    request.headers.get("x-bootstrap-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!header || header !== bootstrapSecret) {
    return unauthorized();
  }

  let body: BootstrapBody;
  try {
    body = (await request.json()) as BootstrapBody;
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const password = String(body.password ?? "");
  const fullName = String(body.fullName ?? "").trim();
  const firstName = String(body.firstName ?? "").trim() || null;
  const lastName = String(body.lastName ?? "").trim() || null;
  const roleSlug = String(body.roleSlug ?? "organisation_owner").trim();
  const organisationSlug = String(body.organisationSlug ?? "paychex")
    .trim()
    .toLowerCase();
  const grantPlatformSuperAdmin = Boolean(body.grantPlatformSuperAdmin);

  if (!email || !password || !fullName) {
    return badRequest("email, password, and fullName are required.");
  }

  if (password.length < 10) {
    return badRequest("password must be at least 10 characters.");
  }

  const admin = createAdminClient();

  // App-level gate (RPC also enforces this).
  const { count: linkedCount, error: countError } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .not("organisation_id", "is", null);

  if (countError) {
    return NextResponse.json(
      { success: false, message: countError.message },
      { status: 500 }
    );
  }

  if ((linkedCount ?? 0) > 0) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Bootstrap disabled: an organisation-linked profile already exists.",
      },
      { status: 403 }
    );
  }

  let userId: string | null = null;
  let createdNewAuthUser = false;

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        first_name: firstName ?? undefined,
        last_name: lastName ?? undefined,
      },
    });

  if (!createError && created.user) {
    userId = created.user.id;
    createdNewAuthUser = true;
  } else if (createError && isExistingUserError(createError.message)) {
    try {
      userId = await findAuthUserIdByEmail(admin, email);
    } catch (lookupError) {
      return NextResponse.json(
        {
          success: false,
          message:
            lookupError instanceof Error
              ? lookupError.message
              : "Failed to look up existing auth user.",
        },
        { status: 500 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Auth user already exists but could not be resolved for bootstrap resume.",
        },
        { status: 400 }
      );
    }

    // Keep credentials/metadata aligned for the resumed attempt.
    const { error: updateError } = await admin.auth.admin.updateUserById(
      userId,
      {
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          first_name: firstName ?? undefined,
          last_name: lastName ?? undefined,
        },
      }
    );

    if (updateError) {
      return NextResponse.json(
        {
          success: false,
          message: `Existing auth user found but update failed: ${updateError.message}`,
          data: { userId },
        },
        { status: 500 }
      );
    }
  } else {
    return NextResponse.json(
      {
        success: false,
        message: createError?.message ?? "Failed to create auth user.",
      },
      { status: 400 }
    );
  }

  // Ensure profile row exists (auth trigger should have created it).
  const { data: profile, error: profileLookupError } = await admin
    .from("profiles")
    .select("id, organisation_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileLookupError) {
    return NextResponse.json(
      { success: false, message: profileLookupError.message, data: { userId } },
      { status: 500 }
    );
  }

  if (!profile) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Auth user exists but profile row is missing. Check handle_new_user trigger.",
        data: { userId },
      },
      { status: 500 }
    );
  }

  const { data: bootstrapData, error: bootstrapError } = await admin.rpc(
    "bootstrap_first_platform_user",
    {
      p_user_id: userId,
      p_organisation_slug: organisationSlug,
      p_full_name: fullName,
      p_first_name: firstName,
      p_last_name: lastName,
      p_org_role_slug: roleSlug,
      p_grant_platform_super_admin: grantPlatformSuperAdmin,
    }
  );

  if (bootstrapError) {
    return NextResponse.json(
      {
        success: false,
        message: bootstrapError.message,
        data: { userId, resumedExistingAuthUser: !createdNewAuthUser },
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    status: createdNewAuthUser ? 201 : 200,
    data: {
      ...(bootstrapData as Record<string, unknown>),
      email,
      resumedExistingAuthUser: !createdNewAuthUser,
    },
    message: createdNewAuthUser
      ? "First user bootstrapped. Sign in at /login."
      : "Existing auth user bootstrap completed. Sign in at /login.",
  });
}
