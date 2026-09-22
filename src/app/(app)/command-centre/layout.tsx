import type { Metadata } from "next";
import "@/styles/command-centre.css";

export const metadata: Metadata = {
  title: "Executive Office",
};

export default function CommandCentreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
