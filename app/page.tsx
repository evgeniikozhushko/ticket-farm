import { redirect } from "next/navigation";

// Placeholder until Phase 4 marketing landing page is implemented.
// Authenticated users land on /dashboard/lottery via Clerk redirect config.
// Unauthenticated users are sent to sign-in.
export default function RootPage() {
  redirect("/sign-in");
}
