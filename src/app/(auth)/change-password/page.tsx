import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { mustChangePassword } from "@/lib/auth/passwordLifecycle";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Mandatory first-login password change for administrator-created accounts. Reachable only while the temporary
 * credential is pending; anyone else is sent on (or to sign-in).
 */
export default async function ChangePasswordPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!mustChangePassword(user)) redirect("/");

  return (
    <AuthPageShell
      title="Choose your password"
      subtitle="You signed in with a temporary password issued by your administrator. Set your own password to continue. Your administrator will not know it."
    >
      <ChangePasswordForm />
    </AuthPageShell>
  );
}
