import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const orgRequiredRoutes = [
  "/dashboard", "/dashboard/(.*)",
  "/admin", "/admin/(.*)",
  "/org", "/org/(.*)",
  "/billing", "/billing/(.*)",
  "/checkin", "/checkin/(.*)",
  "/analytics", "/analytics/(.*)",
];

const isProtectedRoute = createRouteMatcher([
  ...orgRequiredRoutes,
  "/onboarding", "/onboarding/(.*)",
  "/platform", "/platform/(.*)",
]);
const isOrgRequiredRoute = createRouteMatcher(orgRequiredRoutes);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    const { orgId } = await auth.protect();

    if (!orgId && isOrgRequiredRoute(req)) {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
