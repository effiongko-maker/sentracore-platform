import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { AuthPageShell } from "@/components/auth/AuthPageShell";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const expired = params.error === "expired";

  return (
    <AuthPageShell
      title="Forgot your password?"
      subtitle="Enter the email associated with your SentraCore account and we’ll send a reset link if it exists."
      footer={
        <p>Access is by invitation. Public registration is not available.</p>
      }
    >
      {expired ? (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          This password reset link is invalid or has expired. Please request a
          new one.
        </p>
      ) : null}
      <ForgotPasswordForm />
    </AuthPageShell>
  );
}
