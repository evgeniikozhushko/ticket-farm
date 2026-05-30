import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  try {
    await requirePlatformAdmin();
  } catch {
    notFound();
  }

  return <>{children}</>;
}
