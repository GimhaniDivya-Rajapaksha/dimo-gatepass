import { NextResponse } from "next/server";

/**
 * GET /api/sap/test
 * Debug endpoint — tests Azure APIM proxy connectivity.
 * Remove or protect this route in production.
 */
export async function GET() {
  const APIM_BASE = "https://gatepassproxy.azure-api.net";
  const APIM_KEY  = process.env.SAP_APIM_KEY ?? "";

  const results: Record<string, unknown> = {
    config: {
      APIM_BASE,
      SAP_APIM_KEY: APIM_KEY ? `${APIM_KEY.slice(0, 6)}***` : "(NOT SET — add SAP_APIM_KEY to .env.local)",
    },
  };

  const endpoints = [
    { key: "in",    filter: "mmsta eq 'QP30'" },
    { key: "out",   filter: "sdsta eq 'QS60'" },
    { key: "order", filter: "vhcle eq '0000002619'" },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${APIM_BASE}/dimogatepass/${ep.key}`, {
        method:  "POST",
        headers: {
          "Content-Type":              "application/json",
          "Ocp-Apim-Subscription-Key": APIM_KEY,
        },
        body:   JSON.stringify({ filter: ep.filter }),
        signal: AbortSignal.timeout(10_000),
        cache:  "no-store",
      });

      const text = await res.text();
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 500); }

      const data = (parsed as { data?: Record<string, unknown>[] })?.data ?? [];

      results[ep.key] = {
        status:      res.status,
        ok:          res.ok,
        recordCount: data.length,
        fields:      data[0] ? Object.keys(data[0]) : [],
        firstRecord: data[0] ?? null,
      };
    } catch (err) {
      results[ep.key] = {
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return NextResponse.json(results, { status: 200 });
}
