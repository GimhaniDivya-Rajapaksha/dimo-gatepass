import nodemailer from "nodemailer";
import crypto from "crypto";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export function createApprovalToken(passId: string, action: "approve" | "reject"): string {
  const expiry = Date.now() + 48 * 60 * 60 * 1000;
  const secret = process.env.NEXTAUTH_SECRET!;
  const payload = `${passId}:${action}:${expiry}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifyApprovalToken(token: string): { passId: string; action: string } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const parts = decoded.split(":");
    if (parts.length < 4) return null;
    const sig = parts[parts.length - 1];
    const passId = parts[0];
    const action = parts[1];
    const expiryStr = parts[2];
    const expiry = parseInt(expiryStr);
    if (Date.now() > expiry) return null;
    const secret = process.env.NEXTAUTH_SECRET!;
    const payload = `${passId}:${action}:${expiryStr}`;
    const expectedSig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    if (sig !== expectedSig) return null;
    return { passId, action };
  } catch {
    return null;
  }
}

type GatePassEmailData = {
  gatePassNumber: string;
  passType: string;
  passSubType?: string | null;
  vehicle: string;
  chassis?: string | null;
  toLocation?: string | null;
  fromLocation?: string | null;
  departureDate?: string | null;
  departureTime?: string | null;
  createdByName: string;
  approver?: string | null;
};

export async function sendApprovalRequestEmail(
  approverEmail: string,
  approverName: string,
  passId: string,
  pass: GatePassEmailData
): Promise<void> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return; // skip if not configured

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const approveToken = createApprovalToken(passId, "approve");
  const rejectToken  = createApprovalToken(passId, "reject");
  const approveUrl = `${baseUrl}/api/gate-pass/${passId}/email-action?token=${approveToken}&action=approve`;
  const rejectUrl  = `${baseUrl}/api/gate-pass/${passId}/email-action?token=${rejectToken}&action=reject`;
  const viewUrl    = `${baseUrl}/gate-pass/${passId}`;

  const passTypeLabel =
    pass.passType === "LOCATION_TRANSFER" ? "Location Transfer" :
    pass.passType === "CUSTOMER_DELIVERY" ? "Customer Delivery" :
    pass.passType === "AFTER_SALES"       ? `Service/Repair${pass.passSubType ? ` — ${pass.passSubType.replace("_", " ")}` : ""}` :
    pass.passType;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gate Pass Approval Required</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f3f4f6; margin: 0; padding: 20px; }
    .container { max-width: 580px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #1a4f9e, #2563eb); padding: 28px 32px; }
    .header h1 { color: #fff; margin: 0; font-size: 20px; font-weight: 700; }
    .header p { color: #bfdbfe; margin: 6px 0 0; font-size: 13px; }
    .body { padding: 28px 32px; }
    .greeting { font-size: 15px; color: #1f2937; margin-bottom: 16px; }
    .pass-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
    .pass-number { font-family: monospace; font-size: 22px; font-weight: 800; color: #1a4f9e; margin-bottom: 4px; }
    .pass-type { display: inline-block; background: #dbeafe; color: #1d4ed8; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; margin-bottom: 16px; }
    .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .detail-item label { font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 2px; }
    .detail-item span { font-size: 14px; color: #111827; font-weight: 500; }
    .divider { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
    .cta-section { text-align: center; }
    .cta-label { font-size: 13px; color: #6b7280; margin-bottom: 16px; }
    .btn-row { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .btn { display: inline-block; padding: 14px 32px; border-radius: 10px; font-size: 15px; font-weight: 700; text-decoration: none; cursor: pointer; }
    .btn-approve { background: linear-gradient(135deg, #15803d, #22c55e); color: #fff; }
    .btn-reject  { background: #fff; color: #dc2626; border: 2px solid #dc2626; }
    .btn-view    { background: #f1f5f9; color: #475569; font-size: 13px; padding: 10px 20px; }
    .footer { background: #f8fafc; padding: 20px 32px; text-align: center; }
    .footer p { font-size: 12px; color: #9ca3af; margin: 0; line-height: 1.6; }
    .warning { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin-top: 16px; font-size: 12px; color: #92400e; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>&#x26A1; Gate Pass Approval Required</h1>
      <p>DIMO Gate Pass System — Action Needed</p>
    </div>
    <div class="body">
      <p class="greeting">Hello <strong>${approverName}</strong>,</p>
      <p style="font-size:14px;color:#374151;margin-bottom:20px;">
        A new gate pass has been submitted and requires your approval.
      </p>

      <div class="pass-card">
        <div class="pass-number">${pass.gatePassNumber}</div>
        <div class="pass-type">${passTypeLabel}</div>
        <div class="details-grid">
          <div class="detail-item">
            <label>Vehicle</label>
            <span>${pass.vehicle}</span>
          </div>
          ${pass.chassis ? `<div class="detail-item"><label>Chassis No</label><span>${pass.chassis}</span></div>` : ""}
          ${pass.toLocation ? `<div class="detail-item"><label>To Location</label><span>${pass.toLocation}</span></div>` : ""}
          ${pass.fromLocation ? `<div class="detail-item"><label>From Location</label><span>${pass.fromLocation}</span></div>` : ""}
          ${pass.departureDate ? `<div class="detail-item"><label>Departure Date</label><span>${pass.departureDate}</span></div>` : ""}
          ${pass.departureTime ? `<div class="detail-item"><label>Departure Time</label><span>${pass.departureTime}</span></div>` : ""}
          <div class="detail-item">
            <label>Requested By</label>
            <span>${pass.createdByName}</span>
          </div>
        </div>
      </div>

      <hr class="divider">

      <div class="cta-section">
        <p class="cta-label">Click a button below to approve or reject this gate pass:</p>
        <div class="btn-row">
          <a href="${approveUrl}" class="btn btn-approve">&#x2713; Approve</a>
          <a href="${rejectUrl}" class="btn btn-reject">&#x2717; Reject</a>
        </div>
        <div style="margin-top:14px;">
          <a href="${viewUrl}" class="btn btn-view">View Full Details in App &rarr;</a>
        </div>
      </div>

      <div class="warning">
        &#x26A0;&#xFE0F; These approval links expire in <strong>48 hours</strong>. After expiry, please log in to the app to take action.
      </div>
    </div>
    <div class="footer">
      <p>DIMO Gate Pass System &bull; This email was sent automatically.<br>
      Do not reply to this email. Use the buttons above or log in to the app.</p>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || `DIMO Gate Pass <${process.env.SMTP_USER}>`,
    to: approverEmail,
    subject: `[Action Required] Gate Pass ${pass.gatePassNumber} needs your approval`,
    html,
  });
}

export async function sendRejectionNotificationEmail(
  initiatorEmail: string,
  initiatorName: string,
  pass: GatePassEmailData & { rejectionReason?: string | null; approverName: string }
): Promise<void> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const viewUrl = `${baseUrl}/gate-pass/${pass.gatePassNumber}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f3f4f6; margin: 0; padding: 20px; }
    .container { max-width: 580px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #dc2626, #ef4444); padding: 28px 32px; }
    .header h1 { color: #fff; margin: 0; font-size: 20px; font-weight: 700; }
    .body { padding: 28px 32px; }
    .reason-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 16px; margin: 16px 0; }
    .reason-box p { margin: 0; font-size: 14px; color: #991b1b; }
    .btn { display: inline-block; padding: 12px 28px; border-radius: 10px; font-size: 14px; font-weight: 700; text-decoration: none; background: linear-gradient(135deg,#1a4f9e,#2563eb); color: #fff; }
    .footer { background: #f8fafc; padding: 16px 32px; text-align: center; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Gate Pass Rejected</h1>
    </div>
    <div class="body">
      <p>Hello <strong>${initiatorName}</strong>,</p>
      <p>Your gate pass <strong>${pass.gatePassNumber}</strong> for vehicle <strong>${pass.vehicle}</strong> has been <strong>rejected</strong> by ${pass.approverName}.</p>
      ${pass.rejectionReason ? `<div class="reason-box"><p><strong>Reason:</strong> ${pass.rejectionReason}</p></div>` : ""}
      <p>Please review the feedback and create a new gate pass if needed.</p>
      <a href="${viewUrl}" class="btn">View Gate Pass</a>
    </div>
    <div class="footer">DIMO Gate Pass System</div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || `DIMO Gate Pass <${process.env.SMTP_USER}>`,
    to: initiatorEmail,
    subject: `Gate Pass ${pass.gatePassNumber} was rejected`,
    html,
  });
}
