import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { name, email, password } = await req.json();

  if (!name || !email || !password) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "This email is already registered." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({ data: { name, email, passwordHash } });

  // Notify admins only — approvers don't manage user roles
  try {
    const recipients = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true },
    });
    if (recipients.length > 0) {
      await prisma.notification.createMany({
        data: recipients.map((r) => ({
          userId: r.id,
          type: "NEW_USER_REGISTERED",
          title: "New User Registered",
          message: `${name} (${email}) created a new account and needs a role assigned.`,
        })),
      });
    }
  } catch { /* non-critical */ }

  return NextResponse.json({ success: true });
}
