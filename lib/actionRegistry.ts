// The closed set of actions an agent may request against the protected
// records API. Anything not in this list is refused before a credential
// is even checked.
export const ACTION_REGISTRY = [
  "list_records",
  "read_record",
  "export_records",
] as const;

export type AgentAction = (typeof ACTION_REGISTRY)[number];

export function isRegisteredAction(action: string): action is AgentAction {
  return (ACTION_REGISTRY as readonly string[]).includes(action);
}

export type AgentMode = "static" | "rotating";

export function isAgentMode(mode: string): mode is AgentMode {
  return mode === "static" || mode === "rotating";
}
