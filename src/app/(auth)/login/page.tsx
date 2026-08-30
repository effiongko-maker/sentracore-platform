import { LoginForm } from "@/components/auth/LoginForm";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { RecoveryRedirectCatcher } from "@/components/auth/RecoveryRedirectCatcher";
import { safeInternalPath } from "@/lib/auth/urls";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const params = await searchParams;
  // Never treat recovery token material as a post-login destination.
  const nextPath = safeInternalPath(
    params.next &&
      !params.next.includes("access_token") &&
      !params.next.includes("%23") &&
      !params.next.includes("refresh_token")
      ? params.next
      : undefined,
    "/"
  );
  const resetSuccess = params.reset === "success";

  return (
    <AuthPageShell
      title="Sign in to SentraCore"
      footer={
        <p>Access is by invitation. Public registration is not available.</p>
      }
    >
      <RecoveryRedirectCatcher />
      <LoginForm nextPath={nextPath} resetSuccess={resetSuccess} />
    </AuthPageShell>
  );
}
