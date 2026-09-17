import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // The protected resource both agents are trying to reach.
  records: defineTable({
    label: v.string(),
    detail: v.string(),
  }),

  // Every time either agent mints a credential from Kinde.
  credentialEvents: defineTable({
    mode: v.union(v.literal("static"), v.literal("rotating")),
    tokenFingerprint: v.string(),
    issuedAt: v.number(),
    expiresAt: v.number(),
  }).index("by_mode_issuedAt", ["mode", "issuedAt"]),

  // Every call an agent makes against the records API. "unknown" covers
  // requests whose token didn't map to either known agent client - a
  // missing or garbage credential should never be misattributed to the
  // static agent just because that's the fallback bucket.
  actionEvents: defineTable({
    mode: v.union(v.literal("static"), v.literal("rotating"), v.literal("unknown")),
    action: v.string(),
    tokenFingerprint: v.string(),
    allowed: v.boolean(),
    statusCode: v.number(),
    latencyMs: v.number(),
    reason: v.optional(v.string()),
    occurredAt: v.number(),
  }).index("by_mode_occurredAt", ["mode", "occurredAt"]),

  // The exfiltration proof: a captured token replayed after the window.
  leakEvents: defineTable({
    mode: v.union(v.literal("static"), v.literal("rotating")),
    tokenFingerprint: v.string(),
    capturedAt: v.number(),
    replayedAt: v.number(),
    replayResult: v.union(v.literal("allowed"), v.literal("denied")),
    statusCode: v.number(),
    latencyMs: v.number(),
  }).index("by_mode", ["mode"]),
});
