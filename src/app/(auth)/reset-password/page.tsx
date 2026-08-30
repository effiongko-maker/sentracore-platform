import { cookies } from "next/headers";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { PASSWORD_RECOVERY_COOKIE } from "@/lib/auth/urls";

export default async function ResetPasswordPage() {
  const cookieStore = await cookies();
  const hasRecoveryCookie =
    cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value === "1";

  return (
    <AuthPageShell
      title="Set a new password"
      subtitle={
        hasRecoveryCookie
          ? "Choose a new password for your SentraCore account."
          : undefined
      }
      footer={
        <p>Access is by invitation. Public registration is not available.</p>
      }
    >
      <ResetPasswordForm hasRecoveryCookie={hasRecoveryCookie} />
    </AuthPageShell>
  );
}
