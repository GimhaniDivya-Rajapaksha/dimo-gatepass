import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ROLES  = ["INITIATOR","APPROVER","ADMIN","CASHIER","AREA_SALES_OFFICER","SECURITY_OFFICER","SERVICE_ADVISOR"];
const BRANDS = ["Mercedes-Benz","TATA","Jeep"];

const ROLE_NEEDS: Record<string, { location: boolean; brand: boolean; approver: boolean }> = {
  INITIATOR:          { location: true,  brand: true,  approver: true  },
  APPROVER:           { location: true,  brand: true,  approver: false },
  ADMIN:              { location: false, brand: false, approver: false },
  CASHIER:            { location: true,  brand: false, approver: false },
  AREA_SALES_OFFICER: { location: true,  brand: true,  approver: false },
  SECURITY_OFFICER:   { location: true,  brand: false, approver: false },
  SERVICE_ADVISOR:    { location: true,  brand: true,  approver: false },
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // ── Fetch live data ─────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allUsers = await (prisma.user as any).findMany({
      select: { name: true, email: true, role: true, defaultLocation: true },
    });

    const approvers: { name: string; email: string }[] = allUsers
      .filter((u: { role: string | null }) => u.role === "APPROVER")
      .map((u: { name: string; email: string }) => ({ name: u.name, email: u.email }));

    const locationSet = new Set<string>();
    for (const u of allUsers) {
      if (u.defaultLocation?.trim()) locationSet.add(u.defaultLocation.trim());
    }
    try {
      const locs = await prisma.locationOption.findMany({
        select: { plantDescription: true, storageDescription: true },
      });
      for (const l of locs) {
        const label = [l.plantDescription, l.storageDescription].filter(Boolean).join(" - ");
        if (label.trim()) locationSet.add(label.trim());
      }
    } catch { /* ignore */ }
    const locations = Array.from(locationSet).sort();

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ExcelJS = require("exceljs");
    const wb = new ExcelJS.Workbook();

    // ── Hidden ref sheet — source for Location + Approver dropdowns ─────
    const ref = wb.addWorksheet("_Ref", { state: "veryHidden" });
    ref.getColumn(1).values = ["_loc",   ...locations];
    ref.getColumn(2).values = ["_appr",  ...approvers.map((a: { email: string }) => a.email)];

    // Named ranges — use .add(range, name) — only for dynamic lists
    if (locations.length)  wb.definedNames.add(`'_Ref'!$A$2:$A$${locations.length + 1}`,  "LocationList");
    if (approvers.length)  wb.definedNames.add(`'_Ref'!$B$2:$B$${approvers.length + 1}`,  "ApproverList");

    // ── Role Guide sheet ────────────────────────────────────────────────
    const guide = wb.addWorksheet("Role Guide");
    guide.columns = [
      { key: "role", width: 24 }, { key: "location", width: 16 },
      { key: "brand", width: 16 }, { key: "approver", width: 18 },
    ];
    const titleRow = guide.addRow(["DIMO Gate Pass — Column Requirements per Role"]);
    titleRow.getCell(1).font = { bold: true, size: 13, color: { argb: "FF1A4F9E" } };
    guide.mergeCells("A1:D1");
    guide.getRow(1).height = 24;

    const gHead = guide.addRow(["Role", "Location", "Brand", "Approver Email"]);
    gHead.eachCell((cell: { fill: unknown; font: unknown; alignment: unknown }) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A4F9E" } };
      cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
      cell.alignment = { horizontal: "center" };
    });
    guide.getRow(2).height = 20;

    for (const role of ROLES) {
      const n = ROLE_NEEDS[role];
      const row = guide.addRow([
        role,
        n.location ? "✓ Required" : "— Not needed",
        n.brand    ? "✓ Required" : "— Not needed",
        n.approver ? "✓ Required" : "— Not needed",
      ]);
      row.eachCell((cell: { value: unknown; font: unknown; alignment: unknown }, col: number) => {
        cell.alignment = { horizontal: col === 1 ? "left" : "center" };
        if (col > 1) {
          const val = String(cell.value);
          cell.font = { color: { argb: val.startsWith("✓") ? "FF15803D" : "FFD1D5DB" }, bold: val.startsWith("✓") };
        }
      });
    }
    const noteRow = guide.addRow(["* Leave the cell empty if the column is Not needed for that role"]);
    noteRow.getCell(1).font = { italic: true, color: { argb: "FF6B7280" }, size: 9 };
    guide.mergeCells(`A${noteRow.number}:D${noteRow.number}`);

    // ── Main Users sheet ─────────────────────────────────────────────────
    const ws = wb.addWorksheet("Users");
    ws.columns = [
      { header: "name",            key: "name",            width: 24 },
      { header: "email",           key: "email",           width: 30 },
      { header: "password",        key: "password",        width: 18 },
      { header: "role",            key: "role",            width: 24 },
      { header: "approverEmail",   key: "approverEmail",   width: 32 },
      { header: "defaultLocation", key: "defaultLocation", width: 38 },
      { header: "brand",           key: "brand",           width: 20 },
    ];

    // Style header
    ws.getRow(1).eachCell((cell: { fill: unknown; font: unknown; alignment: unknown; border: unknown; note: unknown }, col: number) => {
      cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A4F9E" } };
      cell.font      = { color: { argb: "FFFFFFFF" }, bold: true, size: 11 };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border    = { bottom: { style: "medium", color: { argb: "FF2563EB" } } };
      if (col === 5) cell.note = "INITIATOR only — leave blank for all other roles";
      if (col === 6) cell.note = "All roles except ADMIN";
      if (col === 7) cell.note = "INITIATOR, APPROVER, AREA_SALES_OFFICER, SERVICE_ADVISOR only";
    });
    ws.getRow(1).height = 22;

    // Sample rows
    const samples = [
      { name: "Malmi Perera", email: "malmi@dimo.lk", password: "Password@123", role: "INITIATOR", approverEmail: approvers[0]?.email ?? "", defaultLocation: locations[0] ?? "", brand: "TATA" },
      { name: "Nimal Perera", email: "nimal@dimo.lk", password: "Password@123", role: "APPROVER",  approverEmail: "",                         defaultLocation: locations[0] ?? "", brand: "TATA" },
      { name: "Saman Silva",  email: "saman@dimo.lk", password: "Password@123", role: "CASHIER",   approverEmail: "",                         defaultLocation: locations[0] ?? "", brand: ""     },
      { name: "Admin User",   email: "admin@dimo.lk", password: "Password@123", role: "ADMIN",     approverEmail: "",                         defaultLocation: "",                 brand: ""     },
    ];
    const sampleRoles = ["INITIATOR","APPROVER","CASHIER","ADMIN"];
    const naFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    const naFont = { color: { argb: "FFBDBDBD" }, italic: true, size: 10 };

    for (let i = 0; i < samples.length; i++) {
      ws.addRow(samples[i]);
      const rowNum = i + 2;
      const needs = ROLE_NEEDS[sampleRoles[i]];
      if (!needs.approver) { const c = ws.getCell(`E${rowNum}`); c.value = "N/A"; c.fill = naFill; c.font = naFont; }
      if (!needs.location) { const c = ws.getCell(`F${rowNum}`); c.value = "N/A"; c.fill = naFill; c.font = naFont; }
      if (!needs.brand)    { const c = ws.getCell(`G${rowNum}`); c.value = "N/A"; c.fill = naFill; c.font = naFont; }
    }

    // ── Data validation dropdowns ────────────────────────────────────────
    const dv = ws.dataValidations;

    // Role — inline string (always works, no named range needed)
    dv.add("D2:D500", {
      type: "list", allowBlank: true,
      formulae: [`"${ROLES.join(",")}"`],
      showErrorMessage: true, errorTitle: "Invalid Role", error: `Must be: ${ROLES.join(", ")}`,
    });

    // Brand — inline string (only 3 values, always works)
    dv.add("G2:G500", {
      type: "list", allowBlank: true,
      formulae: [`"${BRANDS.join(",")}"`],
      showErrorMessage: true, errorTitle: "Invalid Brand", error: `Must be: ${BRANDS.join(", ")}`,
    });

    // Location — named range from _Ref sheet
    if (locations.length) {
      dv.add("F2:F500", {
        type: "list", allowBlank: true,
        formulae: ["LocationList"],
        showErrorMessage: true, errorTitle: "Invalid Location", error: "Select a location from the dropdown",
      });
    }

    // Approver — named range from _Ref sheet (INITIATOR only)
    if (approvers.length) {
      dv.add("E2:E500", {
        type: "list", allowBlank: true,
        formulae: ["ApproverList"],
        showErrorMessage: true, errorTitle: "Approver (INITIATOR only)", error: "Only fill this for INITIATOR role",
      });
    }

    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: "A1", to: "G1" };

    const buffer = await wb.xlsx.writeBuffer() as unknown as BodyInit;
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="user-upload-template.xlsx"',
      },
    });
  } catch (err) {
    console.error("user-template error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
