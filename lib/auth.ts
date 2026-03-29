import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        let rows: { id: string; name: string; email: string; passwordHash: string; role: string | null }[];
        try {
          rows = await prisma.$queryRaw<{ id: string; name: string; email: string; passwordHash: string; role: string | null }[]>`
            SELECT id, name, email, "passwordHash", role::text FROM "User" WHERE email = ${credentials.email} LIMIT 1
          `;
        } catch (e) {
          console.error("[auth] DB error during login:", e instanceof Error ? e.message : e);
          throw new Error("Database unavailable. Please try again in a moment.");
        }

        const user = rows[0];
        if (!user) return null;

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // First sign-in only: load all user attributes from DB and store in JWT.
        // After this, NO further DB calls are made for auth — the JWT is self-contained.
        token.id = user.id;
        token.role = (user as { role: string | null }).role ?? null;
        try {
          const rows = await prisma.$queryRaw<{ defaultLocation: string | null; approverName: string | null }[]>`
            SELECT u."defaultLocation", a.name AS "approverName"
            FROM "User" u
            LEFT JOIN "User" a ON a.id = u."approverId"
            WHERE u.id = ${user.id as string}
            LIMIT 1
          `;
          if (rows[0]) {
            token.defaultLocation = rows[0].defaultLocation ?? null;
            token.approverName = rows[0].approverName ?? null;
          }
        } catch {
          // Non-fatal: defaultLocation/approverName will be null until re-login
        }
      }
      // Subsequent requests: return token as-is — zero DB queries.
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.defaultLocation = (token.defaultLocation as string | null) ?? null;
        session.user.approverName = (token.approverName as string | null) ?? null;
      }
      return session;
    },
  },
};
