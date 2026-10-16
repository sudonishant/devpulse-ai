import { NextRequest } from "next/server";

export const runtime = "nodejs";
const ALLOWED = /^(?:health|analyze|validate-key|incidents(?:\/trigger|\/[a-zA-Z0-9-]+(?:\/(?:approve|reject))?)?)$/;

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const endpoint = path.join("/");
  if (!ALLOWED.test(endpoint)) return Response.json({ detail: "Not found" }, { status: 404 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin && origin !== `https://${request.headers.get("host")}`) {
    return Response.json({ detail: "Cross-origin request blocked" }, { status: 403 });
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body) {
    const reader = request.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 250_000) {
        await reader.cancel();
        return Response.json({ detail: "Request too large" }, { status: 413 });
      }
      chunks.push(value);
    }
  }
  try {
    const response = await fetch(`${process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8000"}/api/${endpoint}`, {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
        // Never inject a privileged token into unauthenticated public requests.
        "Authorization": request.headers.get("authorization") || "",
      },
      body: request.method === "GET" ? undefined : Buffer.concat(chunks),
      signal: AbortSignal.timeout(100_000),
      cache: "no-store",
      redirect: "error",
    });
    return new Response(response.body, {
      status: response.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
