import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

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

const directUrl = normalizeEnv(process.env.DIRECT_URL);
const pooledUrl = normalizeEnv(process.env.DATABASE_URL);

// Runtime app traffic should use the pooled connection string.
// DIRECT_URL is intended for migrations / maintenance tasks.
function withAppPoolDefaults(value?: string) {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    const currentLimit = Number(url.searchParams.get("connection_limit") || "0");
    const currentTimeout = Number(url.searchParams.get("pool_timeout") || "0");

    if (!currentLimit || currentLimit < 5) url.searchParams.set("connection_limit", "5");
    if (!currentTimeout || currentTimeout < 30) url.searchParams.set("pool_timeout", "30");

    return url.toString();
  } catch {
    const separator = value.includes("?") ? "&" : "?";
    return `${value}${separator}connection_limit=5&pool_timeout=30`;
  }
}

const databaseUrl = withAppPoolDefaults(pooledUrl || directUrl);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error"] : [],
    ...(databaseUrl
      ? {
          datasources: {
            db: { url: databaseUrl },
          },
        }
      : {}),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
