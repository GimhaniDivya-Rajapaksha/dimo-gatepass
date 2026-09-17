import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { getMaintenanceStatus } from "@/lib/maintenance";

// Proxy files always run on Node.js runtime (declaring `runtime` explicitly is a build
// error in Next.js 16), so getMaintenanceStatus() can use Prisma directly here with no
// extra config needed.

// Always reachable for a signed-in non-Admin, even while maintenance mode is on.
const MAINTENANCE_EXEMPT_PREFIXES = ["/maintenance", "/api/admin/maintenance"];

export default withAuth(
  // Runs only for requests that already passed the `authorized` check below — same
  // requests that previously hit this file with no further logic at all.
  async function middleware(req) {
    const token = req.nextauth.token;
    const { pathname } = req.nextUrl;

    if (
      token &&
      token.role !== "ADMIN" &&
      !MAINTENANCE_EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))
    ) {
      const { enabled } = await getMaintenanceStatus().catch(() => ({ enabled: false, message: null }));
      if (enabled) {
        const url = req.nextUrl.clone();
        url.pathname = "/maintenance";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }

    return NextResponse.next();
  },
  {
    pages: {
      signIn: "/login",
    },
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    "/((?!login|signup|forgot-password|reset-password|api/auth|_next/static|_next/image|favicon.ico|logo-light.png|logo-dark.jpg|maintenance-sap-downtime.jpg).*)",
  ],
};
