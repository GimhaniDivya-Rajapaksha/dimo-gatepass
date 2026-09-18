import { withAuth } from "next-auth/middleware";

// SAP maintenance mode is now enforced client-side (see components/ui/SapMaintenanceOverlay.tsx,
// rendered from each authenticated layout) as a full-screen overlay on top of the existing page,
// rather than a server redirect — so this file only handles the original sign-in gate again.
export default withAuth({
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized: ({ token }) => !!token,
  },
});

export const config = {
  matcher: [
    "/((?!login|signup|forgot-password|reset-password|api/auth|_next/static|_next/image|favicon.ico|logo-light.png|logo-dark.jpg).*)",
  ],
};
