import { config } from "dotenv";
config({ path: ".env.local" });
// The proof: mint a real credential for each agent, capture it exactly as
// an attacker who scraped a log or a support ticket would, wait past the
// rotating agent's window, then replay both captured tokens directly
// against the API — no agent code involved, just the raw stolen value.
import { createHash } from "node:crypto";
import { getStaticCredential, getRotatingCredential } from "../lib/credentialManager";
import { getConvexClient } from "../lib/convexClient";
import { api } from "../convex/_generated/api";

function fingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
}

async function replay(mode: "static" | "rotating", token: string) {
  const base = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!base) throw new Error("Missing NEXT_PUBLIC_CONVEX_SITE_URL in the environment");
  const url = new URL(`${base}/api/records`);
  url.searchParams.set("action", "list_records");

  const startedAt = Date.now();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const latencyMs = Date.now() - startedAt;
  return { status: res.status, latencyMs };
}

async function main() {
  const waitMs = Number(process.env.LEAK_WAIT_MS ?? 150_000);
  const convex = getConvexClient();

  console.log("Minting a real credential for each agent...");
  const staticCred = await getStaticCredential();
  const rotatingCred = await getRotatingCredential();

  const capturedAt = Date.now();
  const staticPrint = fingerprint(staticCred.token);
  const rotatingPrint = fingerprint(rotatingCred.token);
  console.log(`Captured static agent token  (${staticPrint}), expires ${new Date(staticCred.expiresAt).toISOString()}`);
  console.log(`Captured rotating agent token (${rotatingPrint}), expires ${new Date(rotatingCred.expiresAt).toISOString()}`);

  console.log(`Waiting ${Math.round(waitMs / 1000)}s to pass the rotating agent's window...`);
  await new Promise((resolve) => setTimeout(resolve, waitMs));

  console.log("Replaying both captured tokens, unmodified, against the live API...");
  const staticReplay = await replay("static", staticCred.token);
  const rotatingReplay = await replay("rotating", rotatingCred.token);

  console.log(`static  -> HTTP ${staticReplay.status} (${staticReplay.latencyMs}ms)`);
  console.log(`rotating -> HTTP ${rotatingReplay.status} (${rotatingReplay.latencyMs}ms)`);

  const replayedAt = Date.now();
  await convex.mutation(api.records.logLeakReplay, {
    mode: "static",
    tokenFingerprint: staticPrint,
    capturedAt,
    replayedAt,
    replayResult: staticReplay.status === 200 ? "allowed" : "denied",
    statusCode: staticReplay.status,
    latencyMs: staticReplay.latencyMs,
  });
  await convex.mutation(api.records.logLeakReplay, {
    mode: "rotating",
    tokenFingerprint: rotatingPrint,
    capturedAt,
    replayedAt,
    replayResult: rotatingReplay.status === 200 ? "allowed" : "denied",
    statusCode: rotatingReplay.status,
    latencyMs: rotatingReplay.latencyMs,
  });

  console.log("\nLogged both outcomes to Convex.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
