import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { name, email, password, role, approverId, backupApproverId } = await req.json();

    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }
    if (approverId && backupApproverId && approverId === backupApproverId) {
      return NextResponse.json({ error: "Approver 1 and Approver 2 must be different" }, { status: 400 });
    }

    // Users added via the Active Directory picker have no password — they sign in with
    // Microsoft SSO (see lib/auth.ts ensureAzureUser, which does the same for self-provisioned
    // Azure logins). A random hash is stored so the Credentials provider never accepts a guess.
    const passwordHash = await bcrypt.hash(password?.trim() || randomBytes(24).toString("hex"), 10);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = await (prisma.user as any).create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        passwordHash,
        role: role || null,
        ...(approverId ? { approverId } : {}),
        ...(backupApproverId ? { backupApproverId } : {}),
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Email already exists" }, { status: 400 });
    }
    console.error("Create user error:", e);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
