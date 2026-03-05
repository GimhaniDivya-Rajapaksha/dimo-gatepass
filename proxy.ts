import { withAuth } from "next-auth/middleware";

export default withAuth({
  callbacks: {
    authorized: ({ token }) => !!token,
  },
});

export const config = {
  matcher: [
    "/((?!login|signup|forgot-password|reset-password|api/auth|_next/static|_next/image|favicon.ico|logo-light.png|logo-dark.jpg).*)",
  ],
};
