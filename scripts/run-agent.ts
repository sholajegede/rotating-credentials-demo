import { config } from "dotenv";
config({ path: ".env.local" });
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { getCredential } from "../lib/credentialManager";
import { getConvexClient } from "../lib/convexClient";
import { api } from "../convex/_generated/api";
import { isAgentMode, type AgentAction } from "../lib/actionRegistry";

const mode = process.argv[2]?.replace("--mode=", "") ?? "";
if (!isAgentMode(mode)) {
  console.error("Usage: tsx scripts/run-agent.ts --mode=static|rotating");
  process.exit(1);
}

const convex = getConvexClient();
const anthropic = new Anthropic();
const lastFingerprint: { current: string | null } = { current: null };

function fingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
}

async function callRecordsApi(action: AgentAction, id?: string) {
  const credential = await getCredential(mode);
  const print = fingerprint(credential.token);

  if (print !== lastFingerprint.current) {
    lastFingerprint.current = print;
    await convex.mutation(api.records.logCredentialEvent, {
      mode,
      tokenFingerprint: print,
      issuedAt: credential.issuedAt,
      expiresAt: credential.expiresAt,
    });
  }

  const base = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!base) throw new Error("Missing NEXT_PUBLIC_CONVEX_SITE_URL in the environment");
  const url = new URL(`${base}/api/records`);
  url.searchParams.set("action", action);
  if (id) url.searchParams.set("id", id);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${credential.token}` },
  });
  const body = await res.json();
  return { status: res.status, body };
}

const tools: Anthropic.Tool[] = [
  {
    name: "call_records_api",
    description:
      "Call the protected customer-records API. `action` must be one of list_records, read_record, export_records.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list_records", "read_record", "export_records"] },
        id: { type: "string", description: "Record id, required for read_record" },
      },
      required: ["action"],
    },
  },
];

async function main() {
  console.log(`\n--- running ${mode} agent ---`);
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content:
        "You're a support-ops agent. List the customer records, read the first one that " +
        "looks like a risk, then export the full set for the daily digest. Use the tool " +
        "for every step and stop once you've exported.",
    },
  ];

  for (let turn = 0; turn < 6; turn++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (toolUses.length === 0) break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const input = use.input as { action: AgentAction; id?: string };
      const result = await callRecordsApi(input.action, input.id);
      console.log(`[${mode}] ${input.action} -> ${result.status}`);
      toolResults.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: JSON.stringify(result.body),
      });
    }
    messages.push({ role: "user", content: toolResults });

    if (response.stop_reason === "end_turn") break;
  }

  console.log(`--- ${mode} agent finished ---\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
