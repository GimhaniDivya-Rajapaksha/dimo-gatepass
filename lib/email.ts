import crypto from "crypto";

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const GRAPH_MAIL_FROM = "digital.service01@dimolanka.com";

const DIMO_LOGO = "data:image/png;base64,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";

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

async function sendGraphMail(to: string, subject: string, html: string) {
  const config = getGraphConfig();
  if (!config) return;

  const token = await getGraphAccessToken(config);
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
      },
      saveToSentItems: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Graph sendMail failed (${res.status}): ${text}`);
  }
}

export function createApprovalToken(passId: string, action: "approve" | "reject", approverId?: string): string {
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
.btn-row{display:flex;gap:11px;flex-wrap:wrap}
.btn-ok{display:inline-flex;align-items:center;gap:7px;padding:12px 26px;background:#8DC63F;color:#000;border:none;border-radius:3px;font-family:'Gotham','Century Gothic','Futura',sans-serif;font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;text-decoration:none;box-shadow:0 2px 8px rgba(141,198,63,0.35)}
.btn-no{display:inline-flex;align-items:center;gap:7px;padding:12px 26px;background:#fff;color:#000;border:1.5px solid #aaa;border-radius:3px;font-family:'Gotham','Century Gothic','Futura',sans-serif;font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;text-decoration:none}
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
}`;
}

function emailHeader(title: string, subtitle: string, gpNumber: string): string {
  return `
  <div class="header">
    <div class="header-logo">
      <img src="${process.env.NEXTAUTH_URL ?? "https://dimo-gatepass.vercel.app"}/logo-dark.jpg" alt="DIMO" style="width:105px;height:auto;display:block;">
    </div>
    <div class="header-title">
      <div class="co-name">Diesel &amp; Motor Engineering Plc.</div>
      <div class="doc-title">${title}</div>
      <div class="doc-sub">${subtitle}</div>
    </div>
    <div class="header-gp">
      <div class="gp-lbl">Gate Pass No.</div>
      <div class="gp-num">${gpNumber}</div>
    </div>
  </div>
  <div class="green-bar"></div>`;
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
    <div class="sched-grid">
      <div class="sched-cell">
        <div class="sched-icon">
          <svg viewBox="0 0 16 16" fill="none">
            <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="#1E4FA0" stroke-width="1.3"/>
            <path d="M5 1.5V4M11 1.5V4M2 6.5h12" stroke="#1E4FA0" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
        </div>
        <div>
          <div class="sched-lbl">Estimated Departure</div>
          <div class="sched-date">${pass.departureDate}</div>
          ${pass.departureTime ? `<div class="sched-time">${pass.departureTime}</div>` : ""}
        </div>
      </div>
      <div class="sched-cell">
        <div class="sched-icon">
          <svg viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="#1E4FA0" stroke-width="1.3"/>
            <path d="M8 4.5V8l2.5 2.5" stroke="#1E4FA0" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div>
          <div class="sched-lbl">Vehicle</div>
          <div class="sched-date">${pass.vehicle}</div>
          ${pass.chassis ? `<div class="sched-time">${pass.chassis}</div>` : ""}
        </div>
      </div>
    </div>
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
      <div class="btn-row">
        <a href="${approveUrl}" class="btn-ok">&#10003; Approve Gate Pass</a>
        <a href="${rejectUrl}" class="btn-no">&#10005; Reject Gate Pass</a>
      </div>
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
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const viewUrl = `${baseUrl}/gate-pass/${pass.gatePassNumber}`;

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
    <div class="status-top">
      <div class="status-icon">&#10003;</div>
      <div class="status-title">Gate Pass Submitted</div>
    </div>
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
  <div style="text-align:center;">
    <a href="${viewUrl}" class="btn-view">View Gate Pass in System &rarr;</a>
  </div>
</div>
${emailFooter(pass.gatePassNumber)}
</div></div>
</body>
</html>`;

  await sendGraphMail(
    requestedByEmail,
    `Gate Pass ${pass.gatePassNumber} — You are listed as Requested By`,
    html
  );
}

export async function sendRejectionNotificationEmail(
  initiatorEmail: string,
  initiatorName: string,
  pass: GatePassEmailData & { rejectionReason?: string | null; approverName: string }
): Promise<void> {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const viewUrl = `${baseUrl}/gate-pass/${pass.gatePassNumber}`;

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
    <div class="reject-top">
      <div class="reject-icon">&#10005;</div>
      <div class="reject-title">Gate Pass Rejected</div>
    </div>
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
