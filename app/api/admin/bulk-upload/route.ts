import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// Which attributes each role actually needs — anything else is ignored
const ROLE_NEEDS: Record<string, { location: boolean; brand: boolean; approver: boolean }> = {
  INITIATOR:          { location: true,  brand: true,  approver: true  },
  APPROVER:           { location: true,  brand: true,  approver: false },
  ADMIN:              { location: false, brand: false, approver: false },
  CASHIER:            { location: true,  brand: false, approver: false },
  AREA_SALES_OFFICER: { location: true,  brand: true,  approver: false },
  SECURITY_OFFICER:   { location: true,  brand: false, approver: false },
  SERVICE_ADVISOR:    { location: true,  brand: true,  approver: false },
};

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { users } = await req.json();
  if (!Array.isArray(users) || users.length === 0) {
    return NextResponse.json({ error: "No users provided" }, { status: 400 });
  }

  const results: { name: string; status: string; error?: string; skipped?: string[] }[] = [];

  for (const u of users) {
    try {
      if (!u.name?.trim() || !u.email?.trim() || !u.password?.trim()) {
        results.push({ name: u.name || u.email, status: "skipped", error: "Missing name/email/password" });
        continue;
      }

      const role: string = (u.role?.trim() ?? "").toUpperCase();
      const needs = ROLE_NEEDS[role] ?? { location: false, brand: false, approver: false };
      const ignored: string[] = [];

      // Resolve approver — only for INITIATOR
      let approverId: string | null = null;
      if (needs.approver && u.approverEmail?.trim()) {
        const approver = await prisma.user.findUnique({ where: { email: u.approverEmail.trim().toLowerCase() } });
        if (approver) approverId = approver.id;
      } else if (!needs.approver && u.approverEmail?.trim() && u.approverEmail.trim() !== "N/A") {
        ignored.push("approverEmail");
      }

      const attrs: Record<string, string | null> = {};
      if (needs.location && u.defaultLocation?.trim() && u.defaultLocation.trim() !== "N/A") {
        attrs.defaultLocation = u.defaultLocation.trim();
      } else if (!needs.location && u.defaultLocation?.trim() && u.defaultLocation.trim() !== "N/A") {
        ignored.push("defaultLocation");
      }
      if (needs.brand && u.brand?.trim() && u.brand.trim() !== "N/A") {
        attrs.brand = u.brand.trim();
      } else if (!needs.brand && u.brand?.trim() && u.brand.trim() !== "N/A") {
        ignored.push("brand");
      }
      if (approverId !== null) attrs.approverId = approverId;

      const passwordHash = await bcrypt.hash(u.password.trim(), 10);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma.user as any).upsert({
        where:  { email: u.email.trim().toLowerCase() },
        update: { name: u.name.trim(), role: role || null, ...attrs },
        create: { name: u.name.trim(), email: u.email.trim().toLowerCase(), passwordHash, role: role || null, ...attrs },
      });

      results.push({
        name: u.name,
        status: "created",
        ...(ignored.length ? { skipped: ignored } : {}),
      });
    } catch {
      results.push({ name: u.name || u.email, status: "error", error: "Failed to save" });
    }
  }

  return NextResponse.json({ results });
}
