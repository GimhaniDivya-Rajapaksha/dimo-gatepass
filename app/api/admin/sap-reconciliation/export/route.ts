import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchReconciliationRows } from "@/app/api/admin/sap-reconciliation/route";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isAdmin(session: any) {
  return session?.user?.role === "ADMIN";
}

function fmtDate(d: Date | string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function writeStatusOf(eligibility: string): string {
  if (eligibility === "WRITTEN") return "Written";
  if (eligibility === "FAILED") return "Attempted — Failed";
  return "Not Written";
}

const HEADERS = [
  "Vehicle", "Gate Pass Number", "Initiator", "From Location", "To Location",
  "LT Completed Date", "Status at LT Completion", "Current SAP MMSTA", "Current SAP SDSTA",
  "Eligibility", "SAP Write Status", "SAP Write Date", "Last SAP Check",
];

function rowToValues(r: Awaited<ReturnType<typeof fetchReconciliationRows>>[number]): (string)[] {
  return [
    r.vehicle,
    r.gatePassNumber,
    r.initiatorName,
    r.fromLocation,
    r.toLocation,
    fmtDate(r.ltCompletedAt),
    `MMSTA=${r.mmstaAtCompletion || "—"} / SDSTA=${r.sdstaAtCompletion || "—"}`,
    r.latestMmsta ?? "—",
    r.latestSdsta ?? "—",
    r.eligibilityLabel,
    writeStatusOf(r.eligibility),
    fmtDate(r.writtenAt),
    fmtDate(r.lastCheckedAt),
  ];
}

function toCsvValue(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const format = (searchParams.get("format") ?? "csv").toLowerCase();
  const rows = await fetchReconciliationRows({
    eligibility: searchParams.get("eligibility") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  if (format === "xlsx") {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("SAP Reconciliation");
    sheet.addRow(HEADERS).font = { bold: true };
    for (const r of rows) sheet.addRow(rowToValues(r));
    sheet.columns.forEach((col) => { col.width = 22; });

    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="sap-reconciliation-${Date.now()}.xlsx"`,
      },
    });
  }

  const lines = [HEADERS.join(",")];
  for (const r of rows) lines.push(rowToValues(r).map(toCsvValue).join(","));
  const csv = lines.join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sap-reconciliation-${Date.now()}.csv"`,
    },
  });
}
