import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { PASSWORD_RECOVERY_COOKIE } from "@/lib/auth/urls";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname === "/forgot-password") return true;
  if (pathname === "/reset-password") return true;
  if (pathname === "/auth/callback") return true;
  if (pathname === "/api/admin/bootstrap-first-user") return true;
  return false;
}

/** Paths that look like a mangled recovery fragment (`/%23access_token=…`). */
function isMangledRecoveryPath(pathname: string): boolean {
  return (
    pathname.includes("%23") ||
    pathname.includes("access_token") ||
    pathname.toLowerCase().includes("%23access_token")
  );
}

function buildRecoveryCallbackUrl(request: NextRequest): URL {
  const url = request.nextUrl.clone();
  const origin = url.origin;

  let tokenPart = request.nextUrl.pathname.replace(/^\//, "");
  try {
    tokenPart = decodeURIComponent(tokenPart);
  } catch {
    /* keep */
  }
  if (tokenPart.startsWith("#")) tokenPart = tokenPart.slice(1);
  if (tokenPart.startsWith("%23")) {
    try {
      tokenPart = decodeURIComponent(tokenPart).replace(/^#/, "");
    } catch {
      tokenPart = tokenPart.slice(3);
    }
  }

  const extras = new URLSearchParams(request.nextUrl.searchParams);
  extras.delete("next");
  const extraStr = extras.toString();
  const hashBody = extraStr ? `${tokenPart}&${extraStr}` : tokenPart;

  // Absolute URL with fragment — required so tokens are not stuffed into `next=`.
  return new URL(
    `/auth/callback?next=/reset-password#${hashBody}`,
    origin
  );
}

/**
 * Refresh the Supabase Auth session and enforce the authentication boundary.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const inPasswordRecovery =
    request.cookies.get(PASSWORD_RECOVERY_COOKIE)?.value === "1";

  // Rescue `/%23access_token=…` landings before they become /login?next=/%23…
  if (!user && isMangledRecoveryPath(pathname)) {
    return NextResponse.redirect(buildRecoveryCallbackUrl(request));
  }

  if (!user && !isPublicPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.hash = "";
    // Avoid auth loops; never put recovery material into next=
    if (
      pathname !== "/reset-password" &&
      pathname !== "/forgot-password" &&
      !pathname.startsWith("/auth/") &&
      !isMangledRecoveryPath(pathname)
    ) {
      url.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(url);
  }

  // Recovery sessions must finish password update before using the app.
  if (
    user &&
    inPasswordRecovery &&
    pathname !== "/reset-password" &&
    pathname !== "/auth/callback"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/reset-password";
    url.search = "";
    url.hash = "";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = inPasswordRecovery ? "/reset-password" : "/";
    url.search = "";
    url.hash = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
