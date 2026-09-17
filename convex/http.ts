import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import { api } from "./_generated/api";
import { ACTION_REGISTRY, isRegisteredAction } from "../lib/actionRegistry";

const http = httpRouter();

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function fingerprint(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);
}

function modeForClientId(clientId: string | undefined): "static" | "rotating" | null {
  if (!clientId) return null;
  if (clientId === process.env.STATIC_AGENT_CLIENT_ID) return "static";
  if (clientId === process.env.ROTATING_AGENT_CLIENT_ID) return "rotating";
  return null;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) {
    const issuer = requiredEnv("KINDE_ISSUER");
    jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  }
  return jwks;
}

http.route({
  path: "/api/records",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const startedAt = Date.now();
    const url = new URL(request.url);
    const action = url.searchParams.get("action") ?? "";
    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    // Decode without verifying, purely to attribute the attempt in the log
    // even when verification below is about to reject it.
    let claimedClientId: string | undefined;
    try {
      claimedClientId = token ? (decodeJwt(token).azp as string | undefined) : undefined;
    } catch {
      claimedClientId = undefined;
    }
    const claimedMode = modeForClientId(claimedClientId) ?? "static";
    const tokenPrint = token ? await fingerprint(token) : "none";

    async function deny(status: number, reason: string) {
      await ctx.runMutation(api.records.logActionEvent, {
        mode: claimedMode,
        action: action || "unknown",
        tokenFingerprint: tokenPrint,
        allowed: false,
        statusCode: status,
        latencyMs: Date.now() - startedAt,
        reason,
        occurredAt: Date.now(),
      });
      return new Response(JSON.stringify({ error: reason }), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!isRegisteredAction(action)) {
      return deny(400, `action not in closed registry: ${ACTION_REGISTRY.join(", ")}`);
    }
    if (!token) {
      return deny(401, "missing bearer token");
    }

    let verifiedMode: "static" | "rotating";
    try {
      const { payload } = await jwtVerify(token, getJwks(), {
        issuer: requiredEnv("KINDE_ISSUER"),
        audience: requiredEnv("KINDE_M2M_AUDIENCE"),
      });
      const mode = modeForClientId(payload.azp as string | undefined);
      if (!mode) return await deny(403, "token not issued to a known agent client");
      verifiedMode = mode;
    } catch (err) {
      const reason = err instanceof Error ? err.message : "token verification failed";
      return await deny(401, reason);
    }

    const records = await ctx.runQuery(api.records.list, {});
    let body: unknown;
    if (action === "list_records") {
      body = { records: records.map((r) => ({ id: r._id, label: r.label })) };
    } else if (action === "read_record") {
      const id = url.searchParams.get("id");
      const record = records.find((r) => r._id === id) ?? records[0];
      body = { record };
    } else {
      body = { exportedAt: Date.now(), records };
    }

    await ctx.runMutation(api.records.logActionEvent, {
      mode: verifiedMode,
      action,
      tokenFingerprint: tokenPrint,
      allowed: true,
      statusCode: 200,
      latencyMs: Date.now() - startedAt,
      occurredAt: Date.now(),
    });

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
