import { requireOrganizationDocument } from "@/lib/org-setup";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireOrganizationDocument();

  return children;
}
