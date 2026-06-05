import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

async function getGraphToken(): Promise<string> {
  const tenantId = process.env.AZURE_AD_TENANT_ID?.replace(/^["']|["']$/g, "").trim();
  const clientId = process.env.AZURE_AD_CLIENT_ID?.replace(/^["']|["']$/g, "").trim();
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET?.replace(/^["']|["']$/g, "").trim();

  if (!tenantId || !clientId || !clientSecret) throw new Error("Azure AD env vars missing");

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
    }),
  });

  if (!res.ok) throw new Error("Failed to get Graph token");
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q || q.length < 1) return NextResponse.json({ users: [] });

  try {
    const token = await getGraphToken();

    const filter = `startswith(displayName,'${q.replace(/'/g, "''")}') or startswith(mail,'${q.replace(/'/g, "''")}') or startswith(userPrincipalName,'${q.replace(/'/g, "''")}')`;
    const graphUrl = `https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(filter)}&$select=id,displayName,mail,userPrincipalName&$top=15&$orderby=displayName`;

    const graphRes = await fetch(graphUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!graphRes.ok) {
      const err = await graphRes.json().catch(() => ({}));
      console.error("[ad-users] Graph API error:", err);
      return NextResponse.json({ error: "Graph API error" }, { status: 500 });
    }

    const data = await graphRes.json() as { value: { id: string; displayName: string; mail: string; userPrincipalName: string }[] };
    const users = (data.value ?? []).map((u) => ({
      id: u.id,
      name: u.displayName,
      email: u.mail || u.userPrincipalName,
    }));

    return NextResponse.json({ users });
  } catch (e) {
    console.error("[ad-users] error:", e);
    return NextResponse.json({ error: "Failed to search AD users" }, { status: 500 });
  }
}
