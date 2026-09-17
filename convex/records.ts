import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const SEED_RECORDS = [
  { label: "Customer #4471", detail: "Acme Freight — renewal due in 12 days" },
  { label: "Customer #4482", detail: "Northwind Traders — support escalation open" },
  { label: "Customer #4493", detail: "Borealis Retail — usage 3x over plan" },
  { label: "Customer #4507", detail: "Solace Media — churn risk flagged" },
  { label: "Customer #4519", detail: "Kestrel Logistics — invoice overdue" },
];

export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("records").first();
    if (existing) return { seeded: false };
    for (const record of SEED_RECORDS) {
      await ctx.db.insert("records", record);
    }
    return { seeded: true, count: SEED_RECORDS.length };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("records").collect();
  },
});

export const logCredentialEvent = mutation({
  args: {
    mode: v.union(v.literal("static"), v.literal("rotating")),
    tokenFingerprint: v.string(),
    issuedAt: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("credentialEvents", args);
  },
});

export const logActionEvent = mutation({
  args: {
    mode: v.union(v.literal("static"), v.literal("rotating"), v.literal("unknown")),
    action: v.string(),
    tokenFingerprint: v.string(),
    allowed: v.boolean(),
    statusCode: v.number(),
    latencyMs: v.number(),
    reason: v.optional(v.string()),
    occurredAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("actionEvents", args);
  },
});

export const logLeakReplay = mutation({
  args: {
    mode: v.union(v.literal("static"), v.literal("rotating")),
    tokenFingerprint: v.string(),
    capturedAt: v.number(),
    replayedAt: v.number(),
    replayResult: v.union(v.literal("allowed"), v.literal("denied")),
    statusCode: v.number(),
    latencyMs: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("leakEvents", args);
  },
});

export const timeline = query({
  args: {},
  handler: async (ctx) => {
    const [credentials, actions, leaks] = await Promise.all([
      ctx.db.query("credentialEvents").order("desc").take(50),
      ctx.db.query("actionEvents").order("desc").take(50),
      ctx.db.query("leakEvents").order("desc").take(50),
    ]);
    return { credentials, actions, leaks };
  },
});
