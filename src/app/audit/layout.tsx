import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "模板审计",
  robots: { index: false, follow: false },
};

export default function AuditLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
