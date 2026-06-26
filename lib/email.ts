import crypto from "crypto";
import fs from "fs";
import path from "path";

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const GRAPH_MAIL_FROM = "digital.service01@dimolanka.com";


function getGraphConfig() {
  const tenantId = process.env.GRAPH_TENANT_ID || process.env.AZURE_AD_TENANT_ID;
  const clientId = process.env.GRAPH_CLIENT_ID || process.env.AZURE_AD_CLIENT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET || process.env.AZURE_AD_CLIENT_SECRET;
  const sender = (process.env.GRAPH_MAIL_FROM || GRAPH_MAIL_FROM).trim().toLowerCase();

  if (!tenantId || !clientId || !clientSecret) return null;
  if (sender !== GRAPH_MAIL_FROM) {
    throw new Error(`GRAPH_MAIL_FROM must be ${GRAPH_MAIL_FROM}`);
  }

  return { tenantId, clientId, clientSecret, sender };
}

async function getGraphAccessToken(config: NonNullable<ReturnType<typeof getGraphConfig>>) {
  const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: GRAPH_SCOPE,
    grant_type: "client_credentials",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Graph token request failed (${res.status}): ${JSON.stringify(data)}`);
  }

  return data.access_token as string;
}

function getLogoBase64(): string | null {
  try {
    const logoPath = path.join(process.cwd(), "public", "logo-dark.jpg");
    return fs.readFileSync(logoPath).toString("base64");
  } catch {
    return null;
  }
}

async function sendGraphMail(to: string, subject: string, html: string) {
  const config = getGraphConfig();
  if (!config) return;

  const token = await getGraphAccessToken(config);

  const logoBase64 = getLogoBase64();
  const attachments = logoBase64
    ? [
        {
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: "logo.jpg",
          contentType: "image/jpeg",
          contentBytes: logoBase64,
          isInline: true,
          contentId: "logo@dimo",
        },
      ]
    : [];

  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.sender)}/sendMail`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: to } }],
        attachments,
      },
      saveToSentItems: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Graph sendMail failed (${res.status}): ${text}`);
  }
}

export function createApprovalToken(passId: string, action: "approve" | "reject" | "escalation_approve" | "escalation_reject" | "confirm_arrival", approverId?: string): string {
  const expiry = Date.now() + 48 * 60 * 60 * 1000;
  const secret = process.env.NEXTAUTH_SECRET!;
  const payload = `${passId}:${action}:${expiry}:${approverId ?? ""}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifyApprovalToken(token: string): { passId: string; action: string; approverId?: string | null } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const parts = decoded.split(":");
    if (parts.length < 4) return null;
    const sig = parts[parts.length - 1];
    const payloadParts = parts.slice(0, -1);
    const passId = payloadParts[0];
    const action = payloadParts[1];
    const expiryStr = payloadParts[2];
    const approverId = payloadParts[3] || null;
    const expiry = parseInt(expiryStr);
    if (Date.now() > expiry) return null;
    const secret = process.env.NEXTAUTH_SECRET!;
    const payload = payloadParts.join(":");
    const expectedSig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    if (sig !== expectedSig) return null;
    return { passId, action, approverId };
  } catch {
    return null;
  }
}

type GatePassEmailData = {
  gatePassNumber: string;
  passId?: string | null;
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
  onBehalf?: boolean;
};

function baseStyles(): string {
  return `
@font-face{font-family:'Gotham';src:local('Gotham Book'),local('Gotham-Book'),local('Gotham');font-weight:400;font-style:normal}
@font-face{font-family:'Gotham';src:local('Gotham Medium'),local('Gotham-Medium');font-weight:500;font-style:normal}
@font-face{font-family:'Gotham';src:local('Gotham Bold'),local('Gotham-Bold');font-weight:700;font-style:normal}
@font-face{font-family:'Gotham';src:local('Gotham Black'),local('Gotham-Black');font-weight:800;font-style:normal}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#cdd4e6;font-family:'Gotham','Century Gothic','Futura',sans-serif;color:#111;min-height:100vh;padding:36px 20px}
.wrap{max-width:680px;margin:0 auto}
.card{background:#fff;border-radius:4px;overflow:hidden;box-shadow:0 4px 24px rgba(30,79,160,0.18),0 0 0 1px rgba(30,79,160,0.1)}
.header{background:#1E4FA0;display:flex;align-items:stretch}
.header-logo{padding:18px 20px;display:flex;align-items:center;justify-content:center;flex-shrink:0;border-right:1px solid rgba(255,255,255,0.12)}
.header-logo img{width:105px;height:auto;display:block}
.header-title{padding:18px 22px;flex:1;display:flex;flex-direction:column;justify-content:center}
.co-name{font-size:10px;font-weight:700;letter-spacing:0.14em;color:#8DC63F;text-transform:uppercase;margin-bottom:6px}
.doc-title{font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.2px;line-height:1.15;margin-bottom:4px}
.doc-sub{font-size:12px;font-weight:300;color:rgba(255,255,255,0.6);letter-spacing:0.02em}
.header-gp{padding:18px 20px;display:flex;flex-direction:column;align-items:flex-end;justify-content:center;flex-shrink:0;border-left:1px solid rgba(255,255,255,0.12)}
.gp-lbl{font-size:9px;font-weight:500;letter-spacing:0.18em;color:rgba(255,255,255,0.45);text-transform:uppercase;margin-bottom:6px}
.gp-num{font-size:16px;font-weight:700;color:#fff;letter-spacing:0.06em}
.green-bar{height:4px;background:#8DC63F}
.alert-bar{background:#fffbf0;border-bottom:1px solid #e8d8a0;padding:10px 28px;display:flex;align-items:center;gap:9px;font-size:12.5px;color:#7a5a0a;font-weight:500}
.alert-bar span{font-weight:300}
.notice-bar{background:#edf7dd;border-bottom:1px solid #cfe7a2;padding:10px 28px;display:flex;align-items:center;gap:9px;font-size:12.5px;color:#496d10;font-weight:700}
.notice-bar span{font-weight:400;color:#5e6b46}
.body{padding:28px 28px 24px}
.greeting{font-size:14px;font-weight:300;color:#333;line-height:1.7;margin-bottom:24px;padding-bottom:18px;border-bottom:1px solid #d0d8e8}
.greeting strong{font-weight:700;color:#111}
.sec{margin-bottom:22px}
.sec-lbl{font-size:9px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#1E4FA0;margin-bottom:10px;display:flex;align-items:center;gap:8px}
.sec-lbl-line{flex:1;height:1px;background:#d0d8e8;display:inline-block;vertical-align:middle;margin-left:8px}
.info-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:#d0d8e8;border:1px solid #d0d8e8;border-radius:4px;overflow:hidden}
.ic{background:#fff;padding:11px 13px}
.ic-lbl{font-size:8.5px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:#888;margin-bottom:4px}
.ic-val{font-size:13px;font-weight:500;color:#111}
.ic-val.mono{font-size:12.5px;font-weight:700;color:#1E4FA0;letter-spacing:0.04em}
.chip{display:inline-block;background:#e4ecf8;color:#1E4FA0;font-size:9.5px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;padding:3px 9px;border-radius:3px;border:1px solid rgba(30,79,160,0.18)}
.sched-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#d0d8e8;border:1px solid #d0d8e8;border-radius:4px;overflow:hidden}
.sched-cell{background:#fff;padding:13px 15px;display:flex;align-items:center;gap:13px}
.sched-icon{width:34px;height:34px;background:#e4ecf8;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.sched-icon svg{width:16px;height:16px}
.sched-lbl{font-size:8.5px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:#888;margin-bottom:4px}
.sched-date{font-size:13px;font-weight:700;color:#111}
.sched-time{font-size:12.5px;font-weight:500;color:#1E4FA0;margin-top:2px;letter-spacing:0.04em}
.vtable-wrap{border:1px solid #d0d8e8;border-radius:4px;overflow:hidden}
.vtable-bar{background:#000;padding:7px 13px;display:flex;align-items:center;justify-content:space-between;font-size:9px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.6)}
.vtable-badge{background:#8DC63F;color:#000;font-size:10px;font-weight:800;padding:2px 9px;border-radius:2px}
table.vt{width:100%;border-collapse:collapse;font-size:12.5px}
table.vt thead tr{background:#f4f6fb;border-bottom:1px solid #d0d8e8}
table.vt thead th{font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#555;padding:9px 13px;text-align:left}
table.vt tbody tr{border-bottom:1px solid #d0d8e8}
table.vt tbody tr:last-child{border-bottom:none}
table.vt td{padding:10px 13px;color:#333;vertical-align:middle}
table.vt td.m{font-weight:700;color:#111;letter-spacing:0.03em}
.rn{display:inline-flex;align-items:center;justify-content:center;width:21px;height:21px;background:#1E4FA0;color:#fff;font-size:9.5px;font-weight:800;border-radius:50%}
.dtag{display:inline-block;background:#f0f8e2;color:#6ea02f;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:3px;border:1px solid rgba(141,198,63,0.28);letter-spacing:0.02em}
hr.div{border:none;border-top:1px solid #d0d8e8;margin:20px 0}
.action-box{border:1px solid #d0d8e8;border-radius:4px;overflow:hidden;margin-bottom:6px}
.action-head{background:#000;padding:11px 18px;display:flex;align-items:center;gap:9px;font-size:12px;font-weight:700;color:#fff;letter-spacing:0.04em;text-transform:uppercase}
.action-body{background:#f4f6fb;padding:16px 18px 18px}
.action-desc{font-size:13px;font-weight:300;color:#555;line-height:1.6;margin-bottom:16px}
.btn-row{display:flex;gap:40px;flex-wrap:wrap;justify-content:center;align-items:center}
.btn-ok{display:inline-flex;align-items:center;gap:9px;padding:14px 32px;background:#4a8c1c;color:#fff;border:none;border-radius:8px;font-family:'Gotham','Century Gothic','Futura',sans-serif;font-size:13px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;text-decoration:none;box-shadow:0 4px 14px rgba(74,140,28,0.40),0 1px 3px rgba(0,0,0,0.14)}
.btn-no{display:inline-flex;align-items:center;gap:9px;padding:14px 32px;background:#dc2626;color:#fff;border:none;border-radius:8px;font-family:'Gotham','Century Gothic','Futura',sans-serif;font-size:13px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;text-decoration:none;box-shadow:0 4px 14px rgba(220,38,38,0.38),0 1px 3px rgba(0,0,0,0.14)}
.btn-view{display:inline-block;padding:10px 22px;background:#e4ecf8;color:#1E4FA0;border-radius:3px;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;text-decoration:none}
.expiry-note{background:#fffbf0;border:1px solid #fde68a;border-radius:4px;padding:10px 14px;margin-top:14px;font-size:11.5px;color:#92400e}
.status-box{border:1px solid rgba(141,198,63,0.35);background:linear-gradient(180deg,#f6fbe9 0%,#edf7dd 100%);border-radius:4px;padding:16px 16px 14px;margin-bottom:22px}
.status-top{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.status-icon{width:34px;height:34px;border-radius:50%;background:#8DC63F;display:flex;align-items:center;justify-content:center;color:#000;font-size:18px;font-weight:800;flex-shrink:0}
.status-title{font-size:17px;font-weight:800;color:#6ea02f}
.status-desc{font-size:13px;line-height:1.65;color:#555}
.reject-box{border:1px solid rgba(220,38,38,0.3);background:#fef2f2;border-radius:4px;padding:16px 16px 14px;margin-bottom:22px}
.reject-top{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.reject-icon{width:34px;height:34px;border-radius:50%;background:#dc2626;display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;font-weight:800;flex-shrink:0}
.reject-title{font-size:17px;font-weight:800;color:#991b1b}
.reject-reason{background:#fff;border:1px solid #fecaca;border-radius:3px;padding:11px 13px;margin-top:10px;font-size:13px;color:#7f1d1d;line-height:1.6}
.audit-wrap{border:1px solid #d0d8e8;border-radius:4px;overflow:hidden;margin-bottom:22px}
.audit-head{background:#000;color:rgba(255,255,255,0.82);font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;padding:10px 14px}
.audit-table{width:100%;border-collapse:collapse}
.audit-table td{padding:11px 14px;border-bottom:1px solid #d0d8e8;font-size:13px}
.audit-table tr:last-child td{border-bottom:none}
.audit-table td:first-child{width:38%;background:#f4f6fb;color:#555;font-weight:700;letter-spacing:0.02em}
.audit-table td:last-child{color:#111;font-weight:500}
.footer{background:#000;padding:14px 28px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.ft-left{font-size:11px;font-weight:300;color:rgba(255,255,255,0.45);line-height:1.65}
.ft-left strong{font-weight:700;color:#8DC63F;font-size:11.5px}
.ft-ref{font-size:10.5px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.5);background:rgba(255,255,255,0.06);padding:4px 12px;border-radius:3px;border:1px solid rgba(255,255,255,0.1);flex-shrink:0}
@media(max-width:560px){
  .header{flex-direction:column}
  .header-logo{border-right:none;border-bottom:1px solid rgba(255,255,255,0.12);justify-content:flex-start}
  .header-gp{border-left:none;border-top:1px solid rgba(255,255,255,0.12);align-items:flex-start}
  .info-grid{grid-template-columns:1fr 1fr}
  .sched-grid{grid-template-columns:1fr}
  .btn-row{flex-direction:column}
  .body{padding:18px 14px}
  .footer{flex-direction:column;gap:10px}
  .email-hd .hd-logo{display:block !important;width:50% !important;float:left !important;border-right:none !important;border-bottom:1px solid rgba(255,255,255,0.12) !important;box-sizing:border-box !important}
  .email-hd .hd-gp{display:block !important;width:50% !important;float:right !important;border-left:none !important;border-bottom:1px solid rgba(255,255,255,0.12) !important;box-sizing:border-box !important}
  .email-hd .hd-mid{display:block !important;width:100% !important;clear:both !important}
}`;
}

function emailHeader(title: string, subtitle: string, gpNumber: string): string {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" class="email-hd" style="background:#1E4FA0;border-collapse:collapse">
    <tr>
      <td width="80" class="hd-logo" style="padding:18px 14px;border-right:1px solid rgba(255,255,255,0.12);vertical-align:middle;text-align:center;width:80px">
        <img src="cid:logo@dimo" alt="DIMO" style="width:72px;height:auto;display:block;margin:0 auto">
      </td>
      <td class="hd-mid" style="padding:18px 16px;vertical-align:middle">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.14em;color:#8DC63F;text-transform:uppercase;margin-bottom:6px">Diesel &amp; Motor Engineering Plc.</div>
        <div style="font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.2px;line-height:1.2;margin-bottom:4px;word-break:break-word">${title}</div>
        <div style="font-size:12px;font-weight:300;color:rgba(255,255,255,0.6);letter-spacing:0.02em;word-break:break-word">${subtitle}</div>
      </td>
      <td width="100" class="hd-gp" style="padding:18px 14px;border-left:1px solid rgba(255,255,255,0.12);vertical-align:middle;text-align:right;width:100px">
        <div style="font-size:9px;font-weight:500;letter-spacing:0.18em;color:rgba(255,255,255,0.45);text-transform:uppercase;margin-bottom:6px">Gate Pass No.</div>
        <div style="font-size:16px;font-weight:700;color:#fff;letter-spacing:0.06em">${gpNumber}</div>
      </td>
    </tr>
  </table>
  <div style="height:4px;background:#8DC63F"></div>`;
}

function emailFooter(gpNumber: string): string {
  return `
  <div class="footer">
    <div class="ft-left">
      <strong>Diesel &amp; Motor Engineering Plc.</strong> &mdash; Fleet Operations System<br>
      Automated notification. Do not reply to this email directly.
    </div>
    <div class="ft-ref">REF: ${gpNumber}</div>
  </div>`;
}

function secLabel(text: string): string {
  return `<div class="sec-lbl">${text}<span class="sec-lbl-line"></span></div>`;
}

export async function sendApprovalRequestEmail(
  approverEmail: string,
  approverName: string,
  passId: string,
  pass: GatePassEmailData,
  approverId?: string
): Promise<void> {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const approveToken = createApprovalToken(passId, "approve", approverId);
  const rejectToken  = createApprovalToken(passId, "reject", approverId);
  const approveUrl = `${baseUrl}/api/gate-pass/${passId}/email-action?token=${approveToken}&action=approve`;
  const rejectUrl  = `${baseUrl}/api/gate-pass/${passId}/email-action?token=${rejectToken}&action=reject`;
  const viewUrl    = `${baseUrl}/gate-pass/${passId}`;

  const passTypeLabel =
    pass.passType === "LOCATION_TRANSFER" ? "Location Transfer" :
    pass.passType === "CUSTOMER_DELIVERY" ? "Customer Delivery" :
    pass.passType === "AFTER_SALES"       ? `Service / Repair${pass.passSubType ? ` — ${pass.passSubType.replace("_", " ")}` : ""}` :
    pass.passType;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Gate Pass Approval &mdash; ${pass.gatePassNumber}</title>
<style>${baseStyles()}</style>
</head>
<body>
<div class="wrap"><div class="card">
${emailHeader("Gate Pass Approval", "Vehicle Gate Pass &middot; Action Required", pass.gatePassNumber)}
<div class="alert-bar">
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <path d="M7.5 1.5L13.5 13H1.5L7.5 1.5Z" stroke="#92610a" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M7.5 5.5V9M7.5 11h.01" stroke="#92610a" stroke-width="1.3" stroke-linecap="round"/>
  </svg>
  Your approval is required for this gate pass.
  <span>Review all details carefully before taking action.</span>
</div>
<div class="body">
  <div class="greeting">
    Dear <strong>${approverName}</strong>,<br>
    A vehicle gate pass has been submitted and requires your authorisation before departure. Please review the information below in full before making your decision.
  </div>
  <div class="sec">
    ${secLabel("Pass Information")}
    <div class="info-grid">
      <div class="ic"><div class="ic-lbl">Gate Pass No.</div><div class="ic-val mono">${pass.gatePassNumber}</div></div>
      <div class="ic"><div class="ic-lbl">Pass Type</div><div class="ic-val"><span class="chip">${passTypeLabel}</span></div></div>
      <div class="ic"><div class="ic-lbl">Requested By</div><div class="ic-val">${pass.createdByName}</div></div>
      ${pass.fromLocation ? `<div class="ic"><div class="ic-lbl">From Location</div><div class="ic-val">${pass.fromLocation}</div></div>` : ""}
      ${pass.toLocation ? `<div class="ic"><div class="ic-lbl">To Location</div><div class="ic-val">${pass.toLocation}</div></div>` : ""}
      ${pass.approver ? `<div class="ic"><div class="ic-lbl">Approver</div><div class="ic-val">${pass.approver}</div></div>` : ""}
    </div>
  </div>
  ${pass.departureDate ? `
  <div class="sec">
    ${secLabel("Departure Schedule")}
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #d0d8e8;border-radius:4px;border-collapse:collapse;overflow:hidden">
      <tr>
        <td width="50%" style="background:#fff;padding:13px 15px;border-right:1px solid #d0d8e8;vertical-align:middle">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td width="47" style="vertical-align:middle;padding-right:13px">
                <table cellpadding="0" cellspacing="0"><tr>
                  <td width="34" height="34" align="center" valign="middle" style="width:34px;height:34px;background:#dbeafe;border-radius:17px;text-align:center;vertical-align:middle;font-size:18px;line-height:34px">&#128197;</td>
                </tr></table>
              </td>
              <td style="vertical-align:middle">
                <div style="font-size:8.5px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:#888;margin-bottom:4px">Estimated Departure</div>
                <div style="font-size:13px;font-weight:700;color:#111">${pass.departureDate}</div>
                ${pass.departureTime ? `<div style="font-size:12.5px;font-weight:500;color:#1E4FA0;margin-top:2px;letter-spacing:0.04em">${pass.departureTime}</div>` : ""}
              </td>
            </tr>
          </table>
        </td>
        <td width="50%" style="background:#fff;padding:13px 15px;vertical-align:middle">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td width="47" style="vertical-align:middle;padding-right:13px">
                <table cellpadding="0" cellspacing="0"><tr>
                  <td width="34" height="34" align="center" valign="middle" style="width:34px;height:34px;background:#dbeafe;border-radius:17px;text-align:center;vertical-align:middle;font-size:18px;line-height:34px">&#128663;</td>
                </tr></table>
              </td>
              <td style="vertical-align:middle">
                <div style="font-size:8.5px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:#888;margin-bottom:4px">Vehicle</div>
                <div style="font-size:13px;font-weight:700;color:#111">${pass.vehicle}</div>
                ${pass.chassis ? `<div style="font-size:12.5px;font-weight:500;color:#1E4FA0;margin-top:2px;letter-spacing:0.04em">${pass.chassis}</div>` : ""}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>` : ""}
  <div class="sec">
    ${secLabel("Vehicle Details")}
    <div class="vtable-wrap">
      <div class="vtable-bar">
        <span>Vehicle on this pass</span>
        <span class="vtable-badge">1</span>
      </div>
      <table class="vt">
        <thead>
          <tr>
            <th>#</th>
            <th>Vehicle No.</th>
            ${pass.chassis ? "<th>Chassis No.</th>" : ""}
            <th>To Location</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="rn">1</span></td>
            <td class="m">${pass.vehicle}</td>
            ${pass.chassis ? `<td class="m">${pass.chassis}</td>` : ""}
            <td>${pass.toLocation ? `<span class="dtag">${pass.toLocation}</span>` : "&mdash;"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  <hr class="div">
  <div class="action-box">
    <div class="action-head">
      <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
        <path d="M7.5 1.5L13.5 13H1.5L7.5 1.5Z" stroke="white" stroke-width="1.3" stroke-linejoin="round"/>
        <path d="M7.5 5.5V9M7.5 11h.01" stroke="white" stroke-width="1.3" stroke-linecap="round"/>
      </svg>
      Action Required &mdash; Your Decision
    </div>
    <div class="action-body">
      <div class="action-desc">
        Approving authorises the departure of the listed vehicle. Rejecting will notify the requestor and place the gate pass on hold.
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
        <tr>
          <td align="center" style="padding:0">
            <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 auto">
              <tr>
                <td style="padding:0 16px 0 0">
                  <a href="${approveUrl}" class="btn-ok" style="display:inline-flex;align-items:center;gap:9px;padding:14px 32px;background:#4a8c1c;color:#fff;border:none;border-radius:8px;font-family:'Gotham','Century Gothic','Futura',sans-serif;font-size:13px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;text-decoration:none;box-shadow:0 4px 14px rgba(74,140,28,0.40),0 1px 3px rgba(0,0,0,0.14)">
                    <svg width="17" height="17" viewBox="0 0 17 17" fill="none"><path d="M3.5 8.5l4 4 6-7" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    Approve Gate Pass
                  </a>
                </td>
                <td style="padding:0 0 0 16px">
                  <a href="${rejectUrl}" class="btn-no" style="display:inline-flex;align-items:center;gap:9px;padding:14px 32px;background:#dc2626;color:#fff;border:none;border-radius:8px;font-family:'Gotham','Century Gothic','Futura',sans-serif;font-size:13px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;text-decoration:none;box-shadow:0 4px 14px rgba(220,38,38,0.38),0 1px 3px rgba(0,0,0,0.14)">
                    <svg width="17" height="17" viewBox="0 0 17 17" fill="none"><path d="M4.5 4.5l8 8M12.5 4.5l-8 8" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>
                    Reject Gate Pass
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <div class="expiry-note">
        &#x26A0; These links expire in <strong>48 hours</strong>. After expiry, please log in to the system to take action.
      </div>
    </div>
  </div>
  <div style="margin-top:16px;text-align:center;">
    <a href="${viewUrl}" class="btn-view">View Full Details in System &rarr;</a>
  </div>
</div>
${emailFooter(pass.gatePassNumber)}
</div></div>
</body>
</html>`;

  await sendGraphMail(
    approverEmail,
    `[Action Required] Gate Pass ${pass.gatePassNumber} needs your approval`,
    html
  );
}

export async function sendRequestedByNotificationEmail(
  requestedByEmail: string,
  requestedByName: string,
  pass: GatePassEmailData
): Promise<void> {
  const baseUrl = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  const viewUrl = `${baseUrl}/gate-pass/${pass.passId ?? pass.gatePassNumber}`;

  const passTypeLabel =
    pass.passType === "LOCATION_TRANSFER" ? "Location Transfer" :
    pass.passType === "CUSTOMER_DELIVERY" ? "Customer Delivery" :
    pass.passType === "AFTER_SALES"       ? "Service / Repair" :
    pass.passType;

  const now = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Gate Pass Created &mdash; ${pass.gatePassNumber}</title>
<style>${baseStyles()}</style>
</head>
<body>
<div class="wrap"><div class="card">
${emailHeader("Gate Pass Created", "Vehicle Gate Pass &middot; For Your Information", pass.gatePassNumber)}
<div class="notice-bar">
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <circle cx="7.5" cy="7.5" r="6" stroke="#496d10" stroke-width="1.3"/>
    <path d="M7.5 5v4M7.5 10.5h.01" stroke="#496d10" stroke-width="1.3" stroke-linecap="round"/>
  </svg>
  Gate pass created and sent for approval.
  <span>No action is required from you at this stage.</span>
</div>
<div class="body">
  <div class="greeting">
    Dear <strong>${requestedByName}</strong>,<br>
    A gate pass has been created and you have been listed as the <strong>Requested By</strong> person by <strong>${pass.createdByName}</strong>. The pass has been submitted for approval.
  </div>
  <div class="status-box">
    <table cellpadding="0" cellspacing="0" style="margin-bottom:8px"><tr>
      <td width="44" style="vertical-align:middle;padding-right:10px">
        <div style="width:34px;height:34px;border-radius:17px;background:#8DC63F;text-align:center;line-height:34px;color:#000;font-size:18px;font-weight:800">&#10003;</div>
      </td>
      <td style="vertical-align:middle">
        <div class="status-title" style="font-size:17px;font-weight:800;color:#6ea02f">Gate Pass Submitted</div>
      </td>
    </tr></table>
    <div class="status-desc">
      Gate pass <strong>${pass.gatePassNumber}</strong> for vehicle <strong>${pass.vehicle}</strong> has been created and is pending approval.
    </div>
  </div>
  <div class="sec">
    ${secLabel("Pass Information")}
    <div class="info-grid">
      <div class="ic"><div class="ic-lbl">Gate Pass No.</div><div class="ic-val mono">${pass.gatePassNumber}</div></div>
      <div class="ic"><div class="ic-lbl">Pass Type</div><div class="ic-val"><span class="chip">${passTypeLabel}</span></div></div>
      <div class="ic"><div class="ic-lbl">Created By</div><div class="ic-val">${pass.createdByName}</div></div>
      ${pass.fromLocation ? `<div class="ic"><div class="ic-lbl">From Location</div><div class="ic-val">${pass.fromLocation}</div></div>` : ""}
      ${pass.toLocation ? `<div class="ic"><div class="ic-lbl">To Location</div><div class="ic-val">${pass.toLocation}</div></div>` : ""}
      ${pass.departureDate ? `<div class="ic"><div class="ic-lbl">Departure Date</div><div class="ic-val">${pass.departureDate}</div></div>` : ""}
    </div>
  </div>
  <div class="sec">
    ${secLabel("Vehicle Details")}
    <div class="vtable-wrap">
      <div class="vtable-bar">
        <span>Vehicle on this pass</span>
        <span class="vtable-badge">1</span>
      </div>
      <table class="vt">
        <thead>
          <tr>
            <th>#</th>
            <th>Vehicle No.</th>
            ${pass.chassis ? "<th>Chassis No.</th>" : ""}
            <th>To Location</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="rn">1</span></td>
            <td class="m">${pass.vehicle}</td>
            ${pass.chassis ? `<td class="m">${pass.chassis}</td>` : ""}
            <td>${pass.toLocation ? `<span class="dtag">${pass.toLocation}</span>` : "&mdash;"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  <div class="audit-wrap">
    <div class="audit-head">Activity Trail</div>
    <table class="audit-table">
      <tr><td>Status</td><td>Pending Approval</td></tr>
      <tr><td>Created By</td><td>${pass.createdByName}</td></tr>
      <tr><td>Requested By</td><td>${requestedByName}</td></tr>
      ${pass.approver ? `<tr><td>Assigned Approver</td><td>${pass.approver}</td></tr>` : ""}
      <tr><td>Timestamp</td><td>${now}</td></tr>
    </table>
  </div>
  ${!pass.onBehalf ? `<div style="text-align:center;">
    <a href="${viewUrl}" class="btn-view">View Gate Pass in System &rarr;</a>
  </div>` : ""}
</div>
${emailFooter(pass.gatePassNumber)}
</div></div>
</body>
</html>`;

  await sendGraphMail(
    requestedByEmail,
    `Gate Pass ${pass.gatePassNumber} You are listed as Requested By`,
    html
  );
}

export async function sendRejectionNotificationEmail(
  initiatorEmail: string,
  initiatorName: string,
  pass: GatePassEmailData & { rejectionReason?: string | null; approverName: string }
): Promise<void> {
  const baseUrl = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  const viewUrl = `${baseUrl}/gate-pass/${pass.passId ?? pass.gatePassNumber}`;

  const passTypeLabel =
    pass.passType === "LOCATION_TRANSFER" ? "Location Transfer" :
    pass.passType === "CUSTOMER_DELIVERY" ? "Customer Delivery" :
    pass.passType === "AFTER_SALES"       ? "Service / Repair" :
    pass.passType;

  const now = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Gate Pass Rejected &mdash; ${pass.gatePassNumber}</title>
<style>${baseStyles()}</style>
</head>
<body>
<div class="wrap"><div class="card">
${emailHeader("Gate Pass Rejected", "Vehicle Gate Pass &middot; Status Update", pass.gatePassNumber)}
<div class="alert-bar">
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <path d="M7.5 1.5L13.5 13H1.5L7.5 1.5Z" stroke="#92610a" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M7.5 5.5V9M7.5 11h.01" stroke="#92610a" stroke-width="1.3" stroke-linecap="round"/>
  </svg>
  This gate pass has been rejected by ${pass.approverName}.
  <span>Please review the reason below and resubmit if required.</span>
</div>
<div class="body">
  <div class="greeting">
    Dear <strong>${initiatorName}</strong>,<br>
    Your gate pass <strong>${pass.gatePassNumber}</strong> for vehicle <strong>${pass.vehicle}</strong> has been <strong>rejected</strong> by ${pass.approverName}. The vehicle remains at its current location.
  </div>
  <div class="reject-box">
    <table cellpadding="0" cellspacing="0" style="margin-bottom:8px"><tr>
      <td width="44" style="vertical-align:middle;padding-right:10px">
        <div style="width:34px;height:34px;border-radius:17px;background:#dc2626;text-align:center;line-height:34px;color:#fff;font-size:16px;font-weight:800">&#10005;</div>
      </td>
      <td style="vertical-align:middle">
        <div class="reject-title" style="font-size:17px;font-weight:800;color:#991b1b">Gate Pass Rejected</div>
      </td>
    </tr></table>
    <div class="status-desc">
      Rejected by <strong>${pass.approverName}</strong> on ${now}.
    </div>
    ${pass.rejectionReason ? `<div class="reject-reason"><strong>Reason:</strong> ${pass.rejectionReason}</div>` : ""}
  </div>
  <div class="sec">
    ${secLabel("Pass Information")}
    <div class="info-grid">
      <div class="ic"><div class="ic-lbl">Gate Pass No.</div><div class="ic-val mono">${pass.gatePassNumber}</div></div>
      <div class="ic"><div class="ic-lbl">Pass Type</div><div class="ic-val"><span class="chip">${passTypeLabel}</span></div></div>
      <div class="ic"><div class="ic-lbl">Requested By</div><div class="ic-val">${pass.createdByName}</div></div>
      ${pass.fromLocation ? `<div class="ic"><div class="ic-lbl">From Location</div><div class="ic-val">${pass.fromLocation}</div></div>` : ""}
      ${pass.toLocation ? `<div class="ic"><div class="ic-lbl">To Location</div><div class="ic-val">${pass.toLocation}</div></div>` : ""}
      <div class="ic"><div class="ic-lbl">Rejected By</div><div class="ic-val">${pass.approverName}</div></div>
    </div>
  </div>
  <div class="audit-wrap">
    <div class="audit-head">Activity Trail</div>
    <table class="audit-table">
      <tr><td>Status</td><td style="color:#991b1b;font-weight:700">Rejected</td></tr>
      <tr><td>Rejected By</td><td>${pass.approverName}</td></tr>
      <tr><td>Timestamp</td><td>${now}</td></tr>
      ${pass.rejectionReason ? `<tr><td>Rejection Reason</td><td>${pass.rejectionReason}</td></tr>` : ""}
    </table>
  </div>
  <div style="text-align:center;">
    <a href="${viewUrl}" class="btn-view">View Gate Pass in System &rarr;</a>
  </div>
</div>
${emailFooter(pass.gatePassNumber)}
</div></div>
</body>
</html>`;

  await sendGraphMail(
    initiatorEmail,
    `Gate Pass ${pass.gatePassNumber} was rejected`,
    html
  );
}

export async function sendApprovalNotificationEmail(
  recipientEmail: string,
  recipientName: string,
  pass: GatePassEmailData & { approverName: string }
): Promise<void> {
  const baseUrl = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  const viewUrl = `${baseUrl}/gate-pass/${pass.passId ?? pass.gatePassNumber}`;

  const passTypeLabel =
    pass.passType === "LOCATION_TRANSFER" ? "Location Transfer" :
    pass.passType === "CUSTOMER_DELIVERY" ? "Customer Delivery" :
    pass.passType === "AFTER_SALES"       ? "Service / Repair" :
    pass.passType;

  const now = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Gate Pass Approved &mdash; ${pass.gatePassNumber}</title>
<style>${baseStyles()}</style>
</head>
<body>
<div class="wrap"><div class="card">
${emailHeader("Gate Pass Approved", "Vehicle Gate Pass &middot; Status Update", pass.gatePassNumber)}
<div class="notice-bar">
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <circle cx="7.5" cy="7.5" r="6" stroke="#496d10" stroke-width="1.3"/>
    <path d="M5 7.5l2 2 3.5-3.5" stroke="#496d10" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
  This gate pass has been approved by ${pass.approverName}.
  <span>The vehicle is cleared for movement.</span>
</div>
<div class="body">
  <div class="greeting">
    Dear <strong>${recipientName}</strong>,<br>
    Gate pass <strong>${pass.gatePassNumber}</strong> for vehicle <strong>${pass.vehicle}</strong> has been <strong>approved</strong> by ${pass.approverName}.
  </div>
  <div class="status-box">
    <table cellpadding="0" cellspacing="0" style="margin-bottom:8px"><tr>
      <td width="44" style="vertical-align:middle;padding-right:10px">
        <div style="width:34px;height:34px;border-radius:17px;background:#8DC63F;text-align:center;line-height:34px;color:#000;font-size:18px;font-weight:800">&#10003;</div>
      </td>
      <td style="vertical-align:middle">
        <div class="status-title" style="font-size:17px;font-weight:800;color:#6ea02f">Gate Pass Approved</div>
      </td>
    </tr></table>
    <div class="status-desc">
      Approved by <strong>${pass.approverName}</strong> on ${now}.
    </div>
  </div>
  <div class="sec">
    ${secLabel("Pass Information")}
    <div class="info-grid">
      <div class="ic"><div class="ic-lbl">Gate Pass No.</div><div class="ic-val mono">${pass.gatePassNumber}</div></div>
      <div class="ic"><div class="ic-lbl">Pass Type</div><div class="ic-val"><span class="chip">${passTypeLabel}</span></div></div>
      <div class="ic"><div class="ic-lbl">Created By</div><div class="ic-val">${pass.createdByName}</div></div>
      ${pass.fromLocation ? `<div class="ic"><div class="ic-lbl">From Location</div><div class="ic-val">${pass.fromLocation}</div></div>` : ""}
      ${pass.toLocation ? `<div class="ic"><div class="ic-lbl">To Location</div><div class="ic-val">${pass.toLocation}</div></div>` : ""}
      <div class="ic"><div class="ic-lbl">Approved By</div><div class="ic-val">${pass.approverName}</div></div>
    </div>
  </div>
  <div class="audit-wrap">
    <div class="audit-head">Activity Trail</div>
    <table class="audit-table">
      <tr><td>Status</td><td style="color:#4a8c1c;font-weight:700">Approved</td></tr>
      <tr><td>Approved By</td><td>${pass.approverName}</td></tr>
      <tr><td>Timestamp</td><td>${now}</td></tr>
    </table>
  </div>
  <div style="text-align:center;">
    <a href="${viewUrl}" class="btn-view">View Gate Pass in System &rarr;</a>
  </div>
</div>
${emailFooter(pass.gatePassNumber)}
</div></div>
</body>
</html>`;

  await sendGraphMail(
    recipientEmail,
    `Gate Pass ${pass.gatePassNumber} has been approved`,
    html
  );
}

export async function sendAsoTransferOutEmail(
  asoEmail: string,
  asoName: string,
  passId: string,
  pass: {
    gatePassNumber: string;
    passType: string;
    vehicle: string;
    chassis?: string | null;
    fromLocation?: string | null;
    toLocation?: string | null;
    createdByName: string;
  }
): Promise<void> {
  const baseUrl = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  const viewUrl = `${baseUrl}/gate-pass/${passId}`;

  const now = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vehicle Transferred Out &mdash; ${pass.gatePassNumber}</title>
<style>${baseStyles()}</style>
</head>
<body>
<div class="wrap"><div class="card">
${emailHeader("Vehicle Transferred Out", "Vehicle Gate Pass &middot; Transfer Notification", pass.gatePassNumber)}
<div class="alert-bar">
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <path d="M7.5 1.5L13.5 13H1.5L7.5 1.5Z" stroke="#92610a" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M7.5 5.5V9M7.5 11h.01" stroke="#92610a" stroke-width="1.3" stroke-linecap="round"/>
  </svg>
  A vehicle has been transferred out of your location by an Initiator.
  <span>Please review the transfer details below.</span>
</div>
<div class="body">
  <div class="greeting">
    Dear <strong>${asoName}</strong>,<br>
    A vehicle from your location has been transferred by an Initiator. Please review the gate pass details below.
  </div>
  <div class="status-box">
    <table cellpadding="0" cellspacing="0" style="margin-bottom:8px"><tr>
      <td width="44" style="vertical-align:middle;padding-right:10px">
        <div style="width:34px;height:34px;border-radius:17px;background:#f59e0b;text-align:center;line-height:34px;color:#fff;font-size:18px;font-weight:800">&#8594;</div>
      </td>
      <td style="vertical-align:middle">
        <div class="status-title" style="font-size:17px;font-weight:800;color:#b45309">Vehicle Released — Gate Out Confirmed</div>
      </td>
    </tr></table>
    <div class="status-desc">
      Released on ${now} by <strong>${pass.createdByName}</strong> (Initiator).
    </div>
  </div>
  <div class="sec">
    ${secLabel("Transfer Details")}
    <div class="info-grid">
      <div class="ic"><div class="ic-lbl">Gate Pass No.</div><div class="ic-val mono">${pass.gatePassNumber}</div></div>
      <div class="ic"><div class="ic-lbl">Vehicle</div><div class="ic-val mono">${pass.vehicle}</div></div>
      ${pass.chassis ? `<div class="ic"><div class="ic-lbl">Chassis No.</div><div class="ic-val mono">${pass.chassis}</div></div>` : ""}
      <div class="ic"><div class="ic-lbl">Transferred By</div><div class="ic-val">${pass.createdByName}</div></div>
      ${pass.fromLocation ? `<div class="ic"><div class="ic-lbl">From Location</div><div class="ic-val">${pass.fromLocation}</div></div>` : ""}
      ${pass.toLocation ? `<div class="ic"><div class="ic-lbl">To Location</div><div class="ic-val">${pass.toLocation}</div></div>` : ""}
    </div>
  </div>
  <div style="text-align:center;">
    <a href="${viewUrl}" class="btn-view">View Gate Pass in System &rarr;</a>
  </div>
</div>
${emailFooter(pass.gatePassNumber)}
</div></div>
</body>
</html>`;

  await sendGraphMail(
    asoEmail,
    `Vehicle Transferred Out of Your Location — ${pass.gatePassNumber}`,
    html
  );
}

export async function sendEscalationRequestEmail(
  approverEmail: string,
  approverName: string,
  passId: string,
  pass: {
    gatePassNumber: string;
    vehicle: string;
    chassis?: string | null;
    fromLocation?: string | null;
    toLocation?: string | null;
    cashierName: string;
    paidCount: number;
    unpaidCount: number;
    totalCount: number;
  },
  approverId?: string
): Promise<void> {
  const baseUrl = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  const approveToken = createApprovalToken(passId, "escalation_approve", approverId);
  const rejectToken  = createApprovalToken(passId, "escalation_reject",  approverId);
  const approveUrl = `${baseUrl}/api/gate-pass/${passId}/email-action?token=${approveToken}&action=escalation_approve`;
  const rejectUrl  = `${baseUrl}/api/gate-pass/${passId}/email-action?token=${rejectToken}&action=escalation_reject`;
  const viewUrl    = `${baseUrl}/gate-pass/${passId}`;

  const now = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Payment Sign-off Required &mdash; ${pass.gatePassNumber}</title>
<style>${baseStyles()}</style>
</head>
<body>
<div class="wrap"><div class="card">
${emailHeader("Payment Sign-off Required", "Customer Delivery &middot; Cashier Escalation", pass.gatePassNumber)}
<div class="alert-bar">
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <path d="M7.5 1.5L13.5 13H1.5L7.5 1.5Z" stroke="#92610a" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M7.5 5.5V9M7.5 11h.01" stroke="#92610a" stroke-width="1.3" stroke-linecap="round"/>
  </svg>
  Your sign-off is required before this vehicle can be released.
  <span>The Cashier has escalated an unpaid order to you.</span>
</div>
<div class="body">
  <div class="greeting">
    Dear <strong>${approverName}</strong>,<br>
    Cashier <strong>${pass.cashierName}</strong> has escalated gate pass <strong>${pass.gatePassNumber}</strong> to you. <strong>${pass.paidCount} of ${pass.totalCount} service orders</strong> have been cleared — the remaining <strong>${pass.unpaidCount} order${pass.unpaidCount !== 1 ? "s" : ""}</strong> require your sign-off before an invoice can be generated and the vehicle released.
  </div>
  <div class="sec">
    ${secLabel("Pass Information")}
    <div class="info-grid">
      <div class="ic"><div class="ic-lbl">Gate Pass No.</div><div class="ic-val mono">${pass.gatePassNumber}</div></div>
      <div class="ic"><div class="ic-lbl">Escalated By</div><div class="ic-val">${pass.cashierName} (Cashier)</div></div>
      <div class="ic"><div class="ic-lbl">Timestamp</div><div class="ic-val">${now}</div></div>
      ${pass.fromLocation ? `<div class="ic"><div class="ic-lbl">From Location</div><div class="ic-val">${pass.fromLocation}</div></div>` : ""}
      ${pass.toLocation ? `<div class="ic"><div class="ic-lbl">To Location</div><div class="ic-val">${pass.toLocation}</div></div>` : ""}
    </div>
  </div>
  <div class="sec">
    ${secLabel("Vehicle Details")}
    <div class="vtable-wrap">
      <div class="vtable-bar"><span>Vehicle on this pass</span><span class="vtable-badge">1</span></div>
      <table class="vt">
        <thead><tr><th>#</th><th>Vehicle No.</th>${pass.chassis ? "<th>Chassis No.</th>" : ""}<th>Location</th></tr></thead>
        <tbody>
          <tr>
            <td><span class="rn">1</span></td>
            <td class="m">${pass.vehicle}</td>
            ${pass.chassis ? `<td class="m">${pass.chassis}</td>` : ""}
            <td>${pass.fromLocation ? `<span class="dtag">${pass.fromLocation}</span>` : "&mdash;"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  <div class="audit-wrap">
    <div class="audit-head">Order Summary</div>
    <table class="audit-table">
      <tr><td>Total Orders</td><td>${pass.totalCount}</td></tr>
      <tr><td>Cleared by Cashier</td><td style="color:#4a8c1c;font-weight:700">${pass.paidCount}</td></tr>
      <tr><td>Awaiting Your Sign-off</td><td style="color:#dc2626;font-weight:700">${pass.unpaidCount}</td></tr>
    </table>
  </div>
  <hr class="div">
  <div class="action-box">
    <div class="action-head">
      <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
        <path d="M7.5 1.5L13.5 13H1.5L7.5 1.5Z" stroke="white" stroke-width="1.3" stroke-linejoin="round"/>
        <path d="M7.5 5.5V9M7.5 11h.01" stroke="white" stroke-width="1.3" stroke-linecap="round"/>
      </svg>
      Action Required &mdash; Your Decision
    </div>
    <div class="action-body">
      <div class="action-desc">
        Approving authorises the Cashier to generate the invoice and release the vehicle. Rejecting will notify the Cashier to resolve the outstanding orders.
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
        <tr>
          <td align="center" style="padding:0">
            <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 auto">
              <tr>
                <td style="padding:0 16px 0 0">
                  <a href="${approveUrl}" style="display:inline-flex;align-items:center;gap:9px;padding:14px 32px;background:#4a8c1c;color:#fff;border:none;border-radius:8px;font-family:'Gotham','Century Gothic','Futura',sans-serif;font-size:13px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;text-decoration:none;box-shadow:0 4px 14px rgba(74,140,28,0.40),0 1px 3px rgba(0,0,0,0.14)">
                    <svg width="17" height="17" viewBox="0 0 17 17" fill="none"><path d="M3.5 8.5l4 4 6-7" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    Approve Sign-off
                  </a>
                </td>
                <td style="padding:0 0 0 16px">
                  <a href="${rejectUrl}" style="display:inline-flex;align-items:center;gap:9px;padding:14px 32px;background:#dc2626;color:#fff;border:none;border-radius:8px;font-family:'Gotham','Century Gothic','Futura',sans-serif;font-size:13px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;text-decoration:none;box-shadow:0 4px 14px rgba(220,38,38,0.38),0 1px 3px rgba(0,0,0,0.14)">
                    <svg width="17" height="17" viewBox="0 0 17 17" fill="none"><path d="M4.5 4.5l8 8M12.5 4.5l-8 8" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>
                    Reject Sign-off
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <div class="expiry-note">
        &#x26A0; These links expire in <strong>48 hours</strong>. After expiry, please log in to the system to take action.
      </div>
    </div>
  </div>
  <div style="margin-top:16px;text-align:center;">
    <a href="${viewUrl}" class="btn-view">View Full Details in System &rarr;</a>
  </div>
</div>
${emailFooter(pass.gatePassNumber)}
</div></div>
</body>
</html>`;

  await sendGraphMail(
    approverEmail,
    `[Action Required] Payment Sign-off — Gate Pass ${pass.gatePassNumber}`,
    html
  );
}

export async function sendEscalationInitiatorEmail(
  initiatorEmail: string,
  initiatorName: string,
  passId: string,
  pass: {
    gatePassNumber: string;
    vehicle: string;
    chassis?: string | null;
    fromLocation?: string | null;
  },
  event: "escalated" | "approved" | "rejected",
  details: { approverName: string; rejectionReason?: string | null }
): Promise<void> {
  const baseUrl = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  const viewUrl = `${baseUrl}/gate-pass/${passId}`;
  const now = new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const configs = {
    escalated: {
      title: "Cashier Escalated to Approver",
      subtitle: "Customer Delivery &middot; Status Update",
      subject: `Gate Pass ${pass.gatePassNumber} — Cashier escalated to approver`,
      barClass: "notice-bar",
      barText: `Payment clearance sent to ${details.approverName} for sign-off. No action required from you yet.`,
      statusColor: "#6ea02f", statusBg: "#f6fbe9",
      iconColor: "#8DC63F", iconText: "→", iconTextColor: "#000",
      heading: "Cashier Escalated — Awaiting Approver",
      body: `Cashier has cleared all immediate orders and sent the remaining order${""} to <strong>${details.approverName}</strong> for sign-off. You will be notified once the approver responds.`,
    },
    approved: {
      title: "Approver Signed Off",
      subtitle: "Customer Delivery &middot; Status Update",
      subject: `Gate Pass ${pass.gatePassNumber} — Approver signed off, invoice being generated`,
      barClass: "notice-bar",
      barText: `${details.approverName} approved the remaining orders. Cashier will now generate the invoice.`,
      statusColor: "#6ea02f", statusBg: "#f6fbe9",
      iconColor: "#8DC63F", iconText: "✓", iconTextColor: "#000",
      heading: "Approver Signed Off — Invoice In Progress",
      body: `<strong>${details.approverName}</strong> has approved the remaining unpaid orders. The Cashier will now generate the invoice. You will be notified when the vehicle is ready for Gate OUT.`,
    },
    rejected: {
      title: "Sign-off Rejected",
      subtitle: "Customer Delivery &middot; Status Update",
      subject: `Gate Pass ${pass.gatePassNumber} — Approver rejected sign-off request`,
      barClass: "alert-bar",
      barText: `${details.approverName} rejected the cashier's sign-off request. The Cashier will need to resolve the pending orders.`,
      statusColor: "#991b1b", statusBg: "#fef2f2",
      iconColor: "#dc2626", iconText: "✕", iconTextColor: "#fff",
      heading: "Sign-off Rejected — Cashier Taking Action",
      body: `<strong>${details.approverName}</strong> rejected the sign-off request.${details.rejectionReason ? ` Reason: <em>${details.rejectionReason}</em>.` : ""} The Cashier will resolve the pending orders and may re-escalate.`,
    },
  };
  const cfg = configs[event];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${cfg.title} &mdash; ${pass.gatePassNumber}</title>
<style>${baseStyles()}</style>
</head>
<body>
<div class="wrap"><div class="card">
${emailHeader(cfg.title, cfg.subtitle, pass.gatePassNumber)}
<div class="${cfg.barClass}">
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <circle cx="7.5" cy="7.5" r="6" stroke="#496d10" stroke-width="1.3"/>
    <path d="M7.5 5v4M7.5 10.5h.01" stroke="#496d10" stroke-width="1.3" stroke-linecap="round"/>
  </svg>
  ${cfg.barText}
</div>
<div class="body">
  <div class="greeting">
    Dear <strong>${initiatorName}</strong>,<br>
    ${cfg.body}
  </div>
  <div style="border:1px solid ${cfg.statusBg === "#fef2f2" ? "#fecaca" : "rgba(141,198,63,0.35)"};background:${cfg.statusBg};border-radius:4px;padding:16px 16px 14px;margin-bottom:22px">
    <table cellpadding="0" cellspacing="0" style="margin-bottom:8px"><tr>
      <td width="44" style="vertical-align:middle;padding-right:10px">
        <div style="width:34px;height:34px;border-radius:17px;background:${cfg.iconColor};text-align:center;line-height:34px;color:${cfg.iconTextColor};font-size:18px;font-weight:800">${cfg.iconText}</div>
      </td>
      <td style="vertical-align:middle">
        <div style="font-size:17px;font-weight:800;color:${cfg.statusColor}">${cfg.heading}</div>
      </td>
    </tr></table>
    <div style="font-size:13px;color:#555">Updated on ${now}.</div>
  </div>
  <div class="sec">
    ${secLabel("Pass Information")}
    <div class="info-grid">
      <div class="ic"><div class="ic-lbl">Gate Pass No.</div><div class="ic-val mono">${pass.gatePassNumber}</div></div>
      <div class="ic"><div class="ic-lbl">Vehicle</div><div class="ic-val mono">${pass.vehicle}</div></div>
      ${pass.chassis ? `<div class="ic"><div class="ic-lbl">Chassis No.</div><div class="ic-val mono">${pass.chassis}</div></div>` : ""}
      ${pass.fromLocation ? `<div class="ic"><div class="ic-lbl">Location</div><div class="ic-val">${pass.fromLocation}</div></div>` : ""}
      <div class="ic"><div class="ic-lbl">Approver</div><div class="ic-val">${details.approverName}</div></div>
    </div>
  </div>
  <div style="text-align:center;">
    <a href="${viewUrl}" class="btn-view">View Gate Pass in System &rarr;</a>
  </div>
</div>
${emailFooter(pass.gatePassNumber)}
</div></div>
</body>
</html>`;

  await sendGraphMail(initiatorEmail, cfg.subject, html);
}

export async function sendEscalationApprovedEmail(
  cashierEmail: string,
  cashierName: string,
  passId: string,
  pass: {
    gatePassNumber: string;
    vehicle: string;
    chassis?: string | null;
    fromLocation?: string | null;
    approverName: string;
  }
): Promise<void> {
  const baseUrl = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  const viewUrl = `${baseUrl}/gate-pass/${passId}`;

  const now = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Approver Signed Off &mdash; ${pass.gatePassNumber}</title>
<style>${baseStyles()}</style>
</head>
<body>
<div class="wrap"><div class="card">
${emailHeader("Approver Signed Off", "Customer Delivery &middot; Generate Invoice Now", pass.gatePassNumber)}
<div class="notice-bar">
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <circle cx="7.5" cy="7.5" r="6" stroke="#496d10" stroke-width="1.3"/>
    <path d="M5 7.5l2 2 3.5-3.5" stroke="#496d10" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
  ${pass.approverName} approved the remaining orders. Please generate the invoice.
  <span>Action required from you.</span>
</div>
<div class="body">
  <div class="greeting">
    Dear <strong>${cashierName}</strong>,<br>
    <strong>${pass.approverName}</strong> has signed off on the remaining unpaid orders for gate pass <strong>${pass.gatePassNumber}</strong>. Please log in and generate the invoice to release the vehicle.
  </div>
  <div class="status-box">
    <table cellpadding="0" cellspacing="0" style="margin-bottom:8px"><tr>
      <td width="44" style="vertical-align:middle;padding-right:10px">
        <div style="width:34px;height:34px;border-radius:17px;background:#8DC63F;text-align:center;line-height:34px;color:#000;font-size:18px;font-weight:800">&#10003;</div>
      </td>
      <td style="vertical-align:middle">
        <div class="status-title" style="font-size:17px;font-weight:800;color:#6ea02f">Orders Approved — Generate Invoice</div>
      </td>
    </tr></table>
    <div class="status-desc">Signed off by <strong>${pass.approverName}</strong> on ${now}.</div>
  </div>
  <div class="sec">
    ${secLabel("Pass Information")}
    <div class="info-grid">
      <div class="ic"><div class="ic-lbl">Gate Pass No.</div><div class="ic-val mono">${pass.gatePassNumber}</div></div>
      <div class="ic"><div class="ic-lbl">Vehicle</div><div class="ic-val mono">${pass.vehicle}</div></div>
      ${pass.chassis ? `<div class="ic"><div class="ic-lbl">Chassis No.</div><div class="ic-val mono">${pass.chassis}</div></div>` : ""}
      ${pass.fromLocation ? `<div class="ic"><div class="ic-lbl">Location</div><div class="ic-val">${pass.fromLocation}</div></div>` : ""}
      <div class="ic"><div class="ic-lbl">Approved By</div><div class="ic-val">${pass.approverName}</div></div>
    </div>
  </div>
  <div style="text-align:center;">
    <a href="${viewUrl}" class="btn-view">Open Pass &amp; Generate Invoice &rarr;</a>
  </div>
</div>
${emailFooter(pass.gatePassNumber)}
</div></div>
</body>
</html>`;

  await sendGraphMail(
    cashierEmail,
    `Approver Signed Off — Generate Invoice Now — ${pass.gatePassNumber}`,
    html
  );
}

export async function sendEscalationRejectedEmail(
  cashierEmail: string,
  cashierName: string,
  passId: string,
  pass: {
    gatePassNumber: string;
    vehicle: string;
    chassis?: string | null;
    fromLocation?: string | null;
    approverName: string;
    rejectionReason?: string | null;
  }
): Promise<void> {
  const baseUrl = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  const viewUrl = `${baseUrl}/gate-pass/${passId}`;

  const now = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sign-off Rejected &mdash; ${pass.gatePassNumber}</title>
<style>${baseStyles()}</style>
</head>
<body>
<div class="wrap"><div class="card">
${emailHeader("Sign-off Rejected", "Customer Delivery &middot; Action Required", pass.gatePassNumber)}
<div class="alert-bar">
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <path d="M7.5 1.5L13.5 13H1.5L7.5 1.5Z" stroke="#92610a" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M7.5 5.5V9M7.5 11h.01" stroke="#92610a" stroke-width="1.3" stroke-linecap="round"/>
  </svg>
  ${pass.approverName} rejected the sign-off request.
  <span>Please resolve the pending orders and re-escalate if needed.</span>
</div>
<div class="body">
  <div class="greeting">
    Dear <strong>${cashierName}</strong>,<br>
    <strong>${pass.approverName}</strong> has rejected the sign-off request for the remaining unpaid orders on gate pass <strong>${pass.gatePassNumber}</strong>. Please log in to review and take the appropriate action.
  </div>
  <div class="reject-box">
    <table cellpadding="0" cellspacing="0" style="margin-bottom:8px"><tr>
      <td width="44" style="vertical-align:middle;padding-right:10px">
        <div style="width:34px;height:34px;border-radius:17px;background:#dc2626;text-align:center;line-height:34px;color:#fff;font-size:16px;font-weight:800">&#10005;</div>
      </td>
      <td style="vertical-align:middle">
        <div class="reject-title" style="font-size:17px;font-weight:800;color:#991b1b">Sign-off Rejected</div>
      </td>
    </tr></table>
    <div class="status-desc">Rejected by <strong>${pass.approverName}</strong> on ${now}.</div>
    ${pass.rejectionReason ? `<div class="reject-reason"><strong>Reason:</strong> ${pass.rejectionReason}</div>` : ""}
  </div>
  <div class="sec">
    ${secLabel("Pass Information")}
    <div class="info-grid">
      <div class="ic"><div class="ic-lbl">Gate Pass No.</div><div class="ic-val mono">${pass.gatePassNumber}</div></div>
      <div class="ic"><div class="ic-lbl">Vehicle</div><div class="ic-val mono">${pass.vehicle}</div></div>
      ${pass.chassis ? `<div class="ic"><div class="ic-lbl">Chassis No.</div><div class="ic-val mono">${pass.chassis}</div></div>` : ""}
      ${pass.fromLocation ? `<div class="ic"><div class="ic-lbl">Location</div><div class="ic-val">${pass.fromLocation}</div></div>` : ""}
      <div class="ic"><div class="ic-lbl">Rejected By</div><div class="ic-val">${pass.approverName}</div></div>
    </div>
  </div>
  <div style="text-align:center;">
    <a href="${viewUrl}" class="btn-view">Open Pass &amp; Re-escalate &rarr;</a>
  </div>
</div>
${emailFooter(pass.gatePassNumber)}
</div></div>
</body>
</html>`;

  await sendGraphMail(
    cashierEmail,
    `Sign-off Rejected — Action Required — ${pass.gatePassNumber}`,
    html
  );
}

export async function sendAsoArrivalEmail(
  asoEmail: string,
  asoName: string,
  passId: string,
  pass: {
    gatePassNumber: string;
    vehicle: string;
    chassis?: string | null;
    fromLocation?: string | null;
    toLocation?: string | null;
    confirmedByName: string;
    confirmedByRole: string;
  }
): Promise<void> {
  const baseUrl = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  const viewUrl = `${baseUrl}/gate-pass/${passId}`;

  const now = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vehicle Arrived at Destination &mdash; ${pass.gatePassNumber}</title>
<style>${baseStyles()}</style>
</head>
<body>
<div class="wrap"><div class="card">
${emailHeader("Vehicle Arrived at Destination", "Vehicle Gate Pass &middot; Arrival Notification", pass.gatePassNumber)}
<div class="alert-bar" style="background:#ecfdf5;border-color:#6ee7b7;color:#065f46">
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <circle cx="7.5" cy="7.5" r="6" stroke="#059669" stroke-width="1.3"/>
    <path d="M4.5 7.5L6.5 9.5L10.5 5.5" stroke="#059669" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
  The vehicle you transferred out has arrived safely at its destination.
  <span>Transfer complete.</span>
</div>
<div class="body">
  <div class="greeting">
    Dear <strong>${asoName}</strong>,<br>
    The vehicle transferred from your location has arrived at the destination and Gate IN has been confirmed.
  </div>
  <div class="status-box" style="border-color:#6ee7b7;background:#f0fdf4">
    <table cellpadding="0" cellspacing="0" style="margin-bottom:8px"><tr>
      <td width="44" style="vertical-align:middle;padding-right:10px">
        <div style="width:34px;height:34px;border-radius:17px;background:#10b981;text-align:center;line-height:34px;color:#fff;font-size:18px;font-weight:800">&#10003;</div>
      </td>
      <td style="vertical-align:middle">
        <div class="status-title" style="font-size:17px;font-weight:800;color:#065f46">Vehicle Arrived — Gate IN Confirmed</div>
      </td>
    </tr></table>
    <div class="status-desc">
      Confirmed on ${now} by <strong>${pass.confirmedByName}</strong> (${pass.confirmedByRole}).
    </div>
  </div>
  <div class="sec">
    ${secLabel("Transfer Details")}
    <div class="info-grid">
      <div class="ic"><div class="ic-lbl">Gate Pass No.</div><div class="ic-val mono">${pass.gatePassNumber}</div></div>
      <div class="ic"><div class="ic-lbl">Vehicle</div><div class="ic-val mono">${pass.vehicle}</div></div>
      ${pass.chassis ? `<div class="ic"><div class="ic-lbl">Chassis No.</div><div class="ic-val mono">${pass.chassis}</div></div>` : ""}
      <div class="ic"><div class="ic-lbl">Confirmed By</div><div class="ic-val">${pass.confirmedByName} (${pass.confirmedByRole})</div></div>
      ${pass.fromLocation ? `<div class="ic"><div class="ic-lbl">From Location</div><div class="ic-val">${pass.fromLocation}</div></div>` : ""}
      ${pass.toLocation ? `<div class="ic"><div class="ic-lbl">Arrived At</div><div class="ic-val">${pass.toLocation}</div></div>` : ""}
    </div>
  </div>
  <div style="text-align:center;">
    <a href="${viewUrl}" class="btn-view">View Gate Pass in System &rarr;</a>
  </div>
</div>
${emailFooter(pass.gatePassNumber)}
</div></div>
</body>
</html>`;

  await sendGraphMail(
    asoEmail,
    `Vehicle Arrived at Destination — ${pass.gatePassNumber}`,
    html
  );
}

export async function sendAsoConfirmArrivalEmail(
  asoEmail: string,
  asoName: string,
  passId: string,
  asoId: string,
  pass: {
    gatePassNumber: string;
    vehicle: string;
    chassis?: string | null;
    fromLocation?: string | null;
    toLocation?: string | null;
  }
): Promise<void> {
  const baseUrl = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  const confirmToken = createApprovalToken(passId, "confirm_arrival", asoId);
  const confirmUrl  = `${baseUrl}/api/gate-pass/${passId}/email-action?token=${confirmToken}&action=confirm_arrival`;
  const viewUrl     = `${baseUrl}/gate-pass/${passId}`;

  const now = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vehicle Incoming &mdash; Confirm Arrival &mdash; ${pass.gatePassNumber}</title>
<style>${baseStyles()}</style>
</head>
<body>
<div class="wrap"><div class="card">
${emailHeader("Vehicle Incoming — Confirm Arrival", "Location Transfer &middot; Arrival Confirmation Required", pass.gatePassNumber)}
<div class="alert-bar">
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <path d="M7.5 1.5L13.5 13H1.5L7.5 1.5Z" stroke="#92610a" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M7.5 5.5V9M7.5 11h.01" stroke="#92610a" stroke-width="1.3" stroke-linecap="round"/>
  </svg>
  A vehicle is on its way to your plant and requires arrival confirmation.
  <span>Please confirm once the vehicle has arrived.</span>
</div>
<div class="body">
  <div class="greeting">
    Dear <strong>${asoName}</strong>,<br>
    A vehicle has been released and is en route to your plant. Please confirm the arrival once the vehicle has physically reached your location.
  </div>
  <div class="status-box">
    <table cellpadding="0" cellspacing="0" style="margin-bottom:8px"><tr>
      <td width="44" style="vertical-align:middle;padding-right:10px">
        <div style="width:34px;height:34px;border-radius:17px;background:#3b82f6;text-align:center;line-height:34px;color:#fff;font-size:18px;font-weight:800">&#8594;</div>
      </td>
      <td style="vertical-align:middle">
        <div class="status-title" style="font-size:17px;font-weight:800;color:#1d4ed8">Vehicle Released — Awaiting Your Confirmation</div>
      </td>
    </tr></table>
    <div class="status-desc">
      Released on ${now}. Vehicle is heading to <strong>${pass.toLocation ?? "your plant"}</strong>.
    </div>
  </div>
  <div class="sec">
    ${secLabel("Transfer Details")}
    <div class="info-grid">
      <div class="ic"><div class="ic-lbl">Gate Pass No.</div><div class="ic-val mono">${pass.gatePassNumber}</div></div>
      <div class="ic"><div class="ic-lbl">Vehicle</div><div class="ic-val mono">${pass.vehicle}</div></div>
      ${pass.chassis ? `<div class="ic"><div class="ic-lbl">Chassis No.</div><div class="ic-val mono">${pass.chassis}</div></div>` : ""}
      ${pass.fromLocation ? `<div class="ic"><div class="ic-lbl">From Location</div><div class="ic-val">${pass.fromLocation}</div></div>` : ""}
      ${pass.toLocation ? `<div class="ic"><div class="ic-lbl">To Location</div><div class="ic-val">${pass.toLocation}</div></div>` : ""}
    </div>
  </div>
  <hr class="div">
  <div class="action-box">
    <div class="action-head">
      <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
        <circle cx="7.5" cy="7.5" r="6" stroke="white" stroke-width="1.3"/>
        <path d="M4.5 7.5L6.5 9.5L10.5 5.5" stroke="white" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Action Required &mdash; Confirm Vehicle Arrival
    </div>
    <div class="action-body">
      <div class="action-desc">
        Click the button below once the vehicle has physically arrived at your plant. If another ASO has already confirmed, the link will be inactive.
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
        <tr>
          <td align="center" style="padding:0">
            <a href="${confirmUrl}" style="display:inline-flex;align-items:center;gap:9px;padding:14px 36px;background:#15803d;color:#fff;border:none;border-radius:8px;font-family:'Gotham','Century Gothic','Futura',sans-serif;font-size:13px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;text-decoration:none;box-shadow:0 4px 14px rgba(21,128,61,0.40),0 1px 3px rgba(0,0,0,0.14)">
              <svg width="17" height="17" viewBox="0 0 17 17" fill="none"><path d="M3.5 8.5l4 4 6-7" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              Confirm Arrival
            </a>
          </td>
        </tr>
      </table>
      <div class="expiry-note">
        &#x26A0; This link expires in <strong>48 hours</strong>. If it has expired, please log in to the system to confirm arrival from your ASO dashboard.
      </div>
    </div>
  </div>
  <div style="margin-top:16px;text-align:center;">
    <a href="${viewUrl}" class="btn-view">View Gate Pass in System &rarr;</a>
  </div>
</div>
${emailFooter(pass.gatePassNumber)}
</div></div>
</body>
</html>`;

  await sendGraphMail(
    asoEmail,
    `[Action Required] Confirm Vehicle Arrival — ${pass.gatePassNumber}`,
    html
  );
}
