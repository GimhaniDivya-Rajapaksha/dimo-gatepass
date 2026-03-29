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

        // Use raw SQL to bypass stale Prisma client enum validation (CASHIER, AREA_SALES_OFFICER not in generated client)
        const rows = await prisma.$queryRaw<{ id: string; name: string; email: string; passwordHash: string; role: string | null }[]>`
          SELECT id, name, email, "passwordHash", role::text FROM "User" WHERE email = ${credentials.email} LIMIT 1
        `;
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
        // First sign-in: store from credentials
        token.id = user.id;
        token.role = (user as { role: string | null }).role ?? null;
      } else {
        // Subsequent requests: ensure id is always populated (handles old sessions missing id)
        if (!token.id && token.email) {
          try {
            const rows = await prisma.$queryRaw<{ id: string; role: string | null; defaultLocation: string | null }[]>`
              SELECT id, role::text, "defaultLocation" FROM "User" WHERE email = ${token.email as string} LIMIT 1
            `;
            if (rows[0]) {
              token.id = rows[0].id;
              token.role = rows[0].role ?? null;
              token.defaultLocation = rows[0].defaultLocation ?? null;
            }
          } catch {
            // DB temporarily unreachable
          }
        } else if (token.id) {
          // Re-fetch role + approver from DB at most once every 5 minutes.
          // This prevents pool exhaustion on Vercel where every API call runs getServerSession.
          const FIVE_MIN = 5 * 60 * 1000;
          const lastRefreshed = (token.lastRefreshed as number) ?? 0;
          if (Date.now() - lastRefreshed > FIVE_MIN) {
            try {
              const rows = await prisma.$queryRaw<{ role: string | null; defaultLocation: string | null; approverName: string | null }[]>`
                SELECT u.role::text, u."defaultLocation",
                       a.name AS "approverName"
                FROM "User" u
                LEFT JOIN "User" a ON a.id = u."approverId"
                WHERE u.id = ${token.id as string}
                LIMIT 1
              `;
              if (rows[0]) {
                token.role = rows[0].role ?? null;
                token.defaultLocation = rows[0].defaultLocation ?? null;
                token.approverName = rows[0].approverName ?? null;
                token.lastRefreshed = Date.now();
              }
            } catch {
              // DB temporarily unreachable — keep using cached role from token
            }
          }
        }
      }
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
