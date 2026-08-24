import { ProductShell } from "@/components/platform";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProductShell>{children}</ProductShell>;
}
