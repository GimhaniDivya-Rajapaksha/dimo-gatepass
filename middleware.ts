import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getMaintenanceStatus } from "@/lib/maintenance";

// Node.js runtime (not Edge) — needed so getMaintenanceStatus() can use Prisma directly.
export const runtime = "nodejs";

// Always reachable, maintenance mode or not.
const EXEMPT_PREFIXES = [
  "/maintenance",
  "/api/auth",
  "/api/admin/maintenance",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/_next",
  "/favicon.ico",
];

function secret() {
  const raw = process.env.NEXTAUTH_SECRET ?? "";
  return raw.trim().replace(/^['"]|['"]$/g, "");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // Only act on signed-in requests — an unauthenticated visitor still hits each page's
  // own existing "redirect to /login" logic, completely unchanged.
  const token = await getToken({ req, secret: secret() }).catch(() => null);
  if (!token) return NextResponse.next();

  if (token.role === "ADMIN") return NextResponse.next();

  const { enabled } = await getMaintenanceStatus().catch(() => ({ enabled: false, message: null }));
  if (!enabled) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/maintenance";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
