import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// POST /api/admin/bulk-upload
// Body: { users: Array<{ name, email, password, role, approverEmail? }> }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { users } = await req.json();
  if (!Array.isArray(users) || users.length === 0) {
    return NextResponse.json({ error: "No users provided" }, { status: 400 });
  }

  const results: { name: string; status: string; error?: string }[] = [];

  for (const u of users) {
    try {
      if (!u.name?.trim() || !u.email?.trim() || !u.password?.trim()) {
        results.push({ name: u.name || u.email, status: "skipped", error: "Missing name/email/password" });
        continue;
      }

      const passwordHash = await bcrypt.hash(u.password.trim(), 10);

      // Resolve approver by email if provided
      let approverId: string | null = null;
      if (u.approverEmail?.trim()) {
        const approver = await prisma.user.findUnique({ where: { email: u.approverEmail.trim().toLowerCase() } });
        if (approver) approverId = approver.id;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma.user as any).upsert({
        where: { email: u.email.trim().toLowerCase() },
        update: {
          name: u.name.trim(),
          role: u.role || null,
          ...(approverId !== null ? { approverId } : {}),
        },
        create: {
          name: u.name.trim(),
          email: u.email.trim().toLowerCase(),
          passwordHash,
          role: u.role || null,
          ...(approverId !== null ? { approverId } : {}),
        },
      });

      results.push({ name: u.name, status: "created" });
    } catch {
      results.push({ name: u.name || u.email, status: "error", error: "Failed" });
    }
  }

  return NextResponse.json({ results });
}
