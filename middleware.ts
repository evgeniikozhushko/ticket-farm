import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/admin(.*)",
  "/org(.*)",
  "/billing(.*)",
  "/onboarding(.*)",
  "/checkin(.*)",
  "/analytics(.*)",
  "/platform(.*)",
]);

const isOrgRequiredRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/admin(.*)",
  "/org(.*)",
  "/billing(.*)",
  "/checkin(.*)",
  "/analytics(.*)",
]);

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
