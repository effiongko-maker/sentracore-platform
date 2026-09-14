import { ProductShell } from "@/components/platform";
import { bootstrapAppAccess } from "@/lib/access/bootstrapAppAccess";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const bootstrap = await bootstrapAppAccess();

  return (
    <ProductShell
      initialSessionChrome={bootstrap.sessionChrome}
      initialOperatingAccess={bootstrap.operatingAccess}
    >
      {children}
    </ProductShell>
  );
}
