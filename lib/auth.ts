import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

function normalizeEnv(value?: string) {
  if (!value) return undefined;
  let normalized = value.trim();
  normalized = normalized.replace(/\\r\\n$/g, "").replace(/\\n$/g, "");
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized || undefined;
}

async function loadUserClaims(params: { id?: string; email?: string }) {
  const id = normalizeEnv(params.id);
  const email = normalizeEnv(params.email)?.toLowerCase();

  if (!id && !email) return null;

  return prisma.user.findFirst({
    where: id ? { id } : { email },
    select: {
      id: true,
      email: true,
      role: true,
      defaultLocation: true,
      approver: { select: { name: true } },
    },
  });
}

async function ensureAzureUser(params: { email: string; name?: string | null }) {
  const email = normalizeEnv(params.email)?.toLowerCase();

  if (!email) return null;
  const name = normalizeEnv(params.name ?? undefined) || email;

  const existing = await loadUserClaims({ email }).catch(() => null);
  if (existing) return existing;

  const passwordHash = await bcrypt.hash(randomBytes(24).toString("hex"), 10);

  try {
    const created = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: null,
      },
      select: {
        id: true,
        email: true,
        role: true,
        defaultLocation: true,
        approver: { select: { name: true } },
      },
    });
    return created;
  } catch {
    return loadUserClaims({ email }).catch(() => null);
  }
}

const azureClientId = normalizeEnv(process.env.AZURE_AD_CLIENT_ID);
const azureTenantId = normalizeEnv(process.env.AZURE_AD_TENANT_ID);
const azureClientSecret = normalizeEnv(process.env.AZURE_AD_CLIENT_SECRET);

type AzureProfile = {
  sub?: string;
  name?: string;
  email?: string;
  preferred_username?: string;
  upn?: string;
};

const azureChecks: Array<"pkce" | "state"> = ["pkce", "state"];

export const authOptions: NextAuthOptions = {
  secret: normalizeEnv(process.env.NEXTAUTH_SECRET),
  debug: process.env.NODE_ENV === "development",
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    ...(azureClientId && azureTenantId && azureClientSecret
      ? [
          {
            id: "azure-ad",
            name: "Microsoft",
            type: "oauth" as const,
            clientId: azureClientId,
            clientSecret: azureClientSecret,
            wellKnown: `https://login.microsoftonline.com/${azureTenantId}/v2.0/.well-known/openid-configuration`,
            issuer: `https://login.microsoftonline.com/${azureTenantId}/v2.0`,
            authorization: {
              params: {
                scope: "openid profile email",
              },
            },
            idToken: true,
            checks: azureChecks,
            profile(profile: AzureProfile) {
              return {
                id: String(profile.sub ?? ""),
                name: String(profile.name ?? profile.preferred_username ?? "Microsoft User"),
                email: String(profile.email ?? profile.preferred_username ?? profile.upn ?? ""),
                image: null,
                role: null,
              };
            },
            style: {
              logo: "/azure.svg",
              text: "#fff",
              bg: "#0072c6",
            },
          },
        ]
      : []),
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
    async signIn({ user, account }) {
      if (account?.provider !== "azure-ad") return true;

      const email = normalizeEnv(user.email ?? undefined)?.toLowerCase();
      if (!email) return "/login?error=NoAzureEmail";

      const ensuredUser = await ensureAzureUser({
        email,
        name: user.name ?? email,
      }).catch(() => null);

      if (!ensuredUser) return "/login?error=AccountProvisioningFailed";

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        const claims =
          await loadUserClaims({
            id: user.id,
            email: user.email ?? undefined,
          }).catch(() => null);

        token.id = claims?.id ?? user.id;
        token.role = claims?.role ?? (user as { role: string | null }).role ?? null;
        token.defaultLocation = claims?.defaultLocation ?? null;
        token.approverName = claims?.approver?.name ?? null;
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
  logger: {
    error(code, metadata) {
      console.error("[next-auth][error]", code, metadata);
    },
    warn(code) {
      console.warn("[next-auth][warn]", code);
    },
  },
};
