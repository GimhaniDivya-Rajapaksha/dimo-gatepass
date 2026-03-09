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
    return new NextResponse(alreadyProcessedPage(gatePass.gatePassNumber, gatePass.status), { headers: { "Content-Type": "text/html" } });
  }

  if (action === "approve") {
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
        message: `Your gate pass ${gatePass.gatePassNumber} has been approved.`,
        gatePassId: gatePass.id,
      },
    });
    return new NextResponse(successPage(gatePass.gatePassNumber), { headers: { "Content-Type": "text/html" } });
  }

  if (action === "reject") {
    // Show inline reject form — no login required
    return new NextResponse(rejectFormPage(id, token, gatePass.gatePassNumber, gatePass.vehicle ?? ""), { headers: { "Content-Type": "text/html" } });
  }

  return new NextResponse(errorPage("Invalid action."), { status: 400, headers: { "Content-Type": "text/html" } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let token: string | null = null;
  let comment = "";

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    const body = new URLSearchParams(text);
    token = body.get("token");
    comment = body.get("comment") ?? "";
  } else {
    const body = await req.json().catch(() => ({}));
    token = body.token;
    comment = body.comment ?? "";
  }

  if (!token) {
    return new NextResponse(errorPage("Missing token."), { status: 400, headers: { "Content-Type": "text/html" } });
  }

  const verified = verifyApprovalToken(token);
  if (!verified || verified.passId !== id || verified.action !== "reject") {
    return new NextResponse(errorPage("This rejection link is invalid or has expired."), { status: 400, headers: { "Content-Type": "text/html" } });
  }

  const gatePass = await prisma.gatePass.findUnique({
    where: { id },
    include: { createdBy: { select: { name: true, email: true } } },
  });

  if (!gatePass) {
    return new NextResponse(errorPage("Gate pass not found."), { status: 404, headers: { "Content-Type": "text/html" } });
  }
  if (gatePass.status !== "PENDING_APPROVAL") {
    return new NextResponse(alreadyProcessedPage(gatePass.gatePassNumber, gatePass.status), { headers: { "Content-Type": "text/html" } });
  }

  const approver = await prisma.user.findFirst({ where: { role: "APPROVER" } });
  await prisma.gatePass.update({
    where: { id },
    data: {
      status: "REJECTED",
      approvedById: approver?.id,
      approvedAt: new Date(),
      rejectionReason: comment.trim() || "Rejected via email",
    },
  });
  await prisma.notification.create({
    data: {
      userId: gatePass.createdById,
      type: "GATE_PASS_REJECTED",
      title: "Gate Pass Rejected",
      message: `Your gate pass ${gatePass.gatePassNumber} was rejected. ${comment.trim() ? `Reason: ${comment.trim()}` : ""}`,
      gatePassId: gatePass.id,
    },
  });

  // Send rejection email to initiator
  try {
    const { sendRejectionNotificationEmail } = await import("@/lib/email");
    if (gatePass.createdBy?.email) {
      await sendRejectionNotificationEmail(
        gatePass.createdBy.email,
        gatePass.createdBy.name,
        {
          gatePassNumber: gatePass.gatePassNumber,
          passType: gatePass.passType,
          passSubType: gatePass.passSubType,
          vehicle: gatePass.vehicle ?? "",
          chassis: gatePass.chassis,
          rejectionReason: comment.trim() || "Rejected via email",
          approverName: approver?.name ?? "Approver",
        }
      );
    }
  } catch { /* email failure should not block response */ }

  return new NextResponse(rejectedPage(gatePass.gatePassNumber, comment.trim()), { headers: { "Content-Type": "text/html" } });
}

// ── HTML page builders ────────────────────────────────────────────────────────

const BASE = process.env.NEXTAUTH_URL || "http://localhost:3000";

const shell = (title: string, body: string) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
  .card{background:#fff;border-radius:20px;padding:40px 36px;box-shadow:0 8px 40px rgba(0,0,0,.1);max-width:460px;width:100%;text-align:center}
  .logo{font-size:13px;font-weight:800;color:#1a4f9e;letter-spacing:.08em;margin-bottom:28px;opacity:.7}
  .icon{width:68px;height:68px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px}
  h1{font-size:22px;color:#111827;margin-bottom:8px}
  p{font-size:14px;color:#6b7280;line-height:1.6;margin-bottom:0}
  .gp{font-family:monospace;font-size:15px;font-weight:800;color:#1a4f9e;margin:12px 0}
  .btn{display:inline-block;padding:13px 30px;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;margin-top:20px}
  .btn-blue{background:linear-gradient(135deg,#1a4f9e,#2563eb);color:#fff}
  .btn-red{background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff;border:none;cursor:pointer;font-family:inherit;width:100%}
  .btn-ghost{background:#f1f5f9;color:#475569}
  textarea{width:100%;border:1.5px solid #e5e7eb;border-radius:10px;padding:12px 14px;font-size:14px;font-family:inherit;resize:vertical;min-height:100px;margin:16px 0 4px;color:#111827;outline:none;transition:border .15s}
  textarea:focus{border-color:#ef4444}
  label{display:block;text-align:left;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-top:16px}
  .pass-info{background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 18px;margin:20px 0;text-align:left}
  .pass-info .row{display:flex;justify-content:space-between;align-items:center;gap:8px}
  .pass-info .row+.row{margin-top:6px}
  .pass-info span{font-size:13px;color:#991b1b;font-weight:600}
  .pass-info em{font-size:12px;color:#b91c1c;font-style:normal}
</style></head>
<body><div class="card"><div class="logo">DIMO GATE PASS SYSTEM</div>${body}</div></body></html>`;

function rejectFormPage(id: string, token: string, gpNumber: string, vehicle: string) {
  return shell("Reject Gate Pass", `
    <div class="icon" style="background:#fef2f2">
      <svg width="34" height="34" fill="none" stroke="#dc2626" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
    </div>
    <h1>Reject Gate Pass</h1>
    <div class="pass-info">
      <div class="row"><span>${gpNumber}</span><em>${vehicle}</em></div>
    </div>
    <form method="POST" action="/api/gate-pass/${id}/email-action">
      <input type="hidden" name="token" value="${token}">
      <label>Reason for rejection <span style="color:#dc2626">*</span></label>
      <textarea name="comment" placeholder="Enter the reason for rejecting this gate pass..." required></textarea>
      <button type="submit" class="btn btn-red" style="padding:14px">Confirm Rejection</button>
    </form>
    <a href="${BASE}/gate-pass/approve" class="btn btn-ghost" style="display:block;margin-top:12px;font-size:13px">Cancel — Open App</a>
  `);
}

function successPage(gpNumber: string) {
  return shell("Gate Pass Approved", `
    <div class="icon" style="background:linear-gradient(135deg,#15803d,#22c55e)">
      <svg width="34" height="34" fill="none" stroke="#fff" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
    </div>
    <h1>Approved!</h1>
    <div class="gp">${gpNumber}</div>
    <p>This gate pass has been approved successfully.<br>The initiator has been notified.</p>
    <a href="${BASE}/gate-pass/approve" class="btn btn-blue">Back to Dashboard</a>
  `);
}

function rejectedPage(gpNumber: string, comment: string) {
  return shell("Gate Pass Rejected", `
    <div class="icon" style="background:linear-gradient(135deg,#dc2626,#ef4444)">
      <svg width="34" height="34" fill="none" stroke="#fff" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"/></svg>
    </div>
    <h1>Rejected</h1>
    <div class="gp">${gpNumber}</div>
    ${comment ? `<p style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;color:#991b1b;margin-top:12px;font-size:13px"><strong>Reason:</strong> ${comment}</p>` : ""}
    <p style="margin-top:14px">The initiator has been notified of the rejection.</p>
    <a href="${BASE}/gate-pass/approve" class="btn btn-blue" style="margin-top:20px">Back to Dashboard</a>
  `);
}

function alreadyProcessedPage(gpNumber: string, status: string) {
  return shell("Already Processed", `
    <div class="icon" style="background:#f3f4f6">
      <svg width="34" height="34" fill="none" stroke="#9ca3af" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
    </div>
    <h1>Already Processed</h1>
    <div class="gp">${gpNumber}</div>
    <p>This gate pass has already been <strong>${status.toLowerCase().replace(/_/g, " ")}</strong>.<br>No further action is needed.</p>
    <a href="${BASE}/gate-pass/approve" class="btn btn-blue">Open App</a>
  `);
}

function errorPage(message: string) {
  return shell("Link Expired", `
    <div class="icon" style="background:#fef2f2">
      <svg width="34" height="34" fill="none" stroke="#dc2626" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"/></svg>
    </div>
    <h1>Link Expired</h1>
    <p>${message}</p>
    <a href="${BASE}/gate-pass/approve" class="btn btn-blue">Open App</a>
  `);
}
