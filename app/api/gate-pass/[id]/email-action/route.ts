import { NextRequest, NextResponse } from "next/server";
import { verifyApprovalToken } from "@/lib/email";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const action = searchParams.get("action");

  if (!token || !action) {
    return new NextResponse(errorPage("Missing token or action"), { status: 400, headers: { "Content-Type": "text/html" } });
  }

  const verified = verifyApprovalToken(token);
  if (!verified || verified.passId !== id || verified.action !== action) {
    return new NextResponse(errorPage("This approval link is invalid or has expired. Please log in to the app."), { status: 400, headers: { "Content-Type": "text/html" } });
  }

  const gatePass = await prisma.gatePass.findUnique({
    where: { id },
    include: { createdBy: { select: { name: true, email: true } } },
  });

  if (!gatePass) {
    return new NextResponse(errorPage("Gate pass not found."), { status: 404, headers: { "Content-Type": "text/html" } });
  }
  if (gatePass.status !== "PENDING_APPROVAL") {
    return new NextResponse(successPage(`Gate pass ${gatePass.gatePassNumber} has already been ${gatePass.status.toLowerCase().replace("_", " ")}.`, gatePass.gatePassNumber, false), { headers: { "Content-Type": "text/html" } });
  }

  if (action === "approve") {
    // Find an approver to assign
    const approver = await prisma.user.findFirst({ where: { role: "APPROVER" } });
    await prisma.gatePass.update({
      where: { id },
      data: { status: "APPROVED", approvedById: approver?.id, approvedAt: new Date() },
    });
    await prisma.notification.create({
      data: {
        userId: gatePass.createdById,
        type: "GATE_PASS_APPROVED",
        title: "Gate Pass Approved",
        message: `Your gate pass ${gatePass.gatePassNumber} has been approved via email.`,
        gatePassId: gatePass.id,
      },
    });
    return new NextResponse(successPage(`Gate pass ${gatePass.gatePassNumber} has been approved successfully!`, gatePass.gatePassNumber, true), { headers: { "Content-Type": "text/html" } });
  }

  if (action === "reject") {
    // For email reject — redirect to app for rejection reason
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    return NextResponse.redirect(`${baseUrl}/gate-pass/approve/${id}?emailReject=1`);
  }

  return new NextResponse(errorPage("Invalid action."), { status: 400, headers: { "Content-Type": "text/html" } });
}

function successPage(message: string, gpNumber: string, approved: boolean) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gate Pass ${approved ? "Approved" : "Status"}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;border-radius:20px;padding:48px 40px;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,.1);max-width:420px;width:90%}
.icon{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;background:${approved?"linear-gradient(135deg,#15803d,#22c55e)":"#f3f4f6"}}
h1{font-size:22px;color:#111827;margin:0 0 8px}p{font-size:14px;color:#6b7280;margin:0 0 24px}
a{display:inline-block;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;background:linear-gradient(135deg,#1a4f9e,#2563eb);color:#fff}
</style></head><body><div class="card">
<div class="icon"><svg width="32" height="32" fill="none" stroke="white" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="${approved?"M5 13l4 4L19 7":"M9 12l2 2 4-4"}"/></svg></div>
<h1>${approved?"Approved!":"Already Processed"}</h1><p>${message}</p>
<p style="font-size:12px;color:#9ca3af;font-family:monospace">${gpNumber}</p>
<a href="${process.env.NEXTAUTH_URL||"http://localhost:3000"}/gate-pass/approve">Back to Dashboard</a>
</div></body></html>`;
}

function errorPage(message: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;border-radius:20px;padding:48px 40px;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,.1);max-width:420px;width:90%}
.icon{width:64px;height:64px;border-radius:50%;background:#fef2f2;display:flex;align-items:center;justify-content:center;margin:0 auto 20px}
h1{font-size:22px;color:#991b1b;margin:0 0 8px}p{font-size:14px;color:#6b7280;margin:0 0 24px}
a{display:inline-block;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;background:linear-gradient(135deg,#1a4f9e,#2563eb);color:#fff}
</style></head><body><div class="card">
<div class="icon"><svg width="32" height="32" fill="none" stroke="#dc2626" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"/></svg></div>
<h1>Link Expired</h1><p>${message}</p>
<a href="${process.env.NEXTAUTH_URL||"http://localhost:3000"}/gate-pass/approve">Open App</a>
</div></body></html>`;
}
