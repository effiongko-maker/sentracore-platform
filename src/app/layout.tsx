import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { connection } from "next/server";
import "@/styles/globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "SentraCore™",
    template: "%s · SentraCore™",
  },
  description:
    "SentraCore™ — Enterprise Operating Platform by Beacon Africa Limited.",
  icons: {
    icon: "/brand/sentracore-logo.png",
    apple: "/brand/sentracore-logo.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Every document is rendered per request so Next.js can apply the proxy's CSP nonce to its scripts.
  await connection();
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full font-sans antialiased">{children}</body>
    </html>
  );
}
