import type { AgentMode } from "./actionRegistry";

interface CachedToken {
  token: string;
  issuedAt: number;
  expiresAt: number;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function fetchM2MToken(clientId: string, clientSecret: string): Promise<CachedToken> {
  const domain = env("KINDE_DOMAIN");
  const audience = env("KINDE_M2M_AUDIENCE");
  const res = await fetch(`${domain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      audience,
    }),
  });
  if (!res.ok) {
    throw new Error(`Kinde token request failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as TokenResponse;
  const issuedAt = Date.now();
  return {
    token: data.access_token,
    issuedAt,
    expiresAt: issuedAt + data.expires_in * 1000,
  };
}

// The static agent mints one token for its entire process lifetime and
// never checks whether it is about to expire. This is what most
// long-running agent processes do by default.
let staticToken: CachedToken | null = null;
export async function getStaticCredential(): Promise<CachedToken> {
  if (staticToken) return staticToken;
  staticToken = await fetchM2MToken(
    env("STATIC_AGENT_CLIENT_ID"),
    env("STATIC_AGENT_CLIENT_SECRET"),
  );
  return staticToken;
}

// The rotating agent never lets its credential get close to expiry: it
// checks a safety margin before every call and re-mints proactively.
const ROTATION_SAFETY_MARGIN_MS = 15_000;
let rotatingToken: CachedToken | null = null;
export async function getRotatingCredential(): Promise<CachedToken> {
  const now = Date.now();
  if (rotatingToken && now < rotatingToken.expiresAt - ROTATION_SAFETY_MARGIN_MS) {
    return rotatingToken;
  }
  rotatingToken = await fetchM2MToken(
    env("ROTATING_AGENT_CLIENT_ID"),
    env("ROTATING_AGENT_CLIENT_SECRET"),
  );
  return rotatingToken;
}

export async function getCredential(mode: AgentMode): Promise<CachedToken> {
  return mode === "static" ? getStaticCredential() : getRotatingCredential();
}
