import { gateApiCapability } from "@/lib/access/gateApi";

import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/access/server";
import { createAdminClient } from "@/utils/supabase/admin";

type InviteUserBody = {
  email?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
};

function badRequest(message: string) {
  return NextResponse.json(
    { success: false, message },
    { status: 400 }
  );
}

export async function POST(request: Request) {
  const gate = await gateApiCapability("users.manage");
if (!gate.ok) return gate.response;
  try {
    await requireCapability("users.manage");

    let body: InviteUserBody;

    try {
      body = (await request.json()) as InviteUserBody;
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const email = String(body.email ?? "").trim().toLowerCase();
    const fullName = String(body.fullName ?? "").trim();
    const firstName = String(body.firstName ?? "").trim() || undefined;
    const lastName = String(body.lastName ?? "").trim() || undefined;

    if (!email || !fullName) {
      return badRequest("email and fullName are required.");
    }

    const admin = createAdminClient();

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${new URL(request.url).origin}/auth/callback`,
      data: {
        full_name: fullName,
        first_name: firstName,
        last_name: lastName,
      },
    });

    if (error) {
      return NextResponse.json(
        {
          success: false,
          message: error.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        userId: data.user?.id ?? null,
        email,
      },
      message: "User invitation sent.",
    });
  } catch (error) {
    const status =
      error instanceof Error && "status" in error
        ? Number((error as { status?: unknown }).status)
        : 500;

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to send user invitation.",
      },
      { status: status === 401 || status === 403 ? status : 500 }
    );
  }
}