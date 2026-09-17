"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour12: false });
}

function StatusPill({ allowed }: { allowed: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        allowed
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
          : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
      }`}
    >
      {allowed ? "allowed" : "denied"}
    </span>
  );
}

function ModeCard({ mode }: { mode: "static" | "rotating" }) {
  const timeline = useQuery(api.records.timeline);
  const credentials = timeline?.credentials.filter((c) => c.mode === mode) ?? [];
  const actions = timeline?.actions.filter((a) => a.mode === mode) ?? [];
  const latest = credentials[0];

  return (
    <div className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 p-5">
      <h2 className="text-lg font-semibold capitalize mb-1">{mode} agent</h2>
      <p className="text-sm text-zinc-500 mb-4">
        {mode === "static"
          ? "Mints one token for its whole process lifetime."
          : "Re-mints before every safety-margin window closes."}
      </p>

      {latest ? (
        <div className="mb-4 rounded-md bg-zinc-50 dark:bg-zinc-900 p-3 text-sm font-mono">
          <div>token {latest.tokenFingerprint}</div>
          <div className="text-zinc-500">issued {formatTime(latest.issuedAt)}</div>
          <div className="text-zinc-500">expires {formatTime(latest.expiresAt)}</div>
        </div>
      ) : (
        <p className="mb-4 text-sm text-zinc-400">No credential minted yet.</p>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-zinc-500">
            <th className="pb-2 font-medium">action</th>
            <th className="pb-2 font-medium">status</th>
            <th className="pb-2 font-medium">latency</th>
          </tr>
        </thead>
        <tbody>
          {actions.map((a) => (
            <tr key={a._id} className="border-t border-zinc-100 dark:border-zinc-800">
              <td className="py-1.5">{a.action}</td>
              <td className="py-1.5">
                <StatusPill allowed={a.allowed} /> {a.statusCode}
              </td>
              <td className="py-1.5 text-zinc-500">{a.latencyMs}ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeakProof() {
  const timeline = useQuery(api.records.timeline);
  const leaks = timeline?.leaks ?? [];
  if (leaks.length === 0) return null;

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-5">
      <h2 className="text-lg font-semibold mb-1">Leak replay proof</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Both tokens captured at the same instant, replayed raw against the API after the window.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-zinc-500">
            <th className="pb-2 font-medium">mode</th>
            <th className="pb-2 font-medium">result</th>
            <th className="pb-2 font-medium">status</th>
            <th className="pb-2 font-medium">latency</th>
          </tr>
        </thead>
        <tbody>
          {leaks.map((l) => (
            <tr key={l._id} className="border-t border-zinc-100 dark:border-zinc-800">
              <td className="py-1.5 capitalize">{l.mode}</td>
              <td className="py-1.5">
                <StatusPill allowed={l.replayResult === "allowed"} />
              </td>
              <td className="py-1.5">{l.statusCode}</td>
              <td className="py-1.5 text-zinc-500">{l.latencyMs}ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex-1 bg-zinc-50 dark:bg-black px-6 py-12">
      <main className="mx-auto flex max-w-4xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold">Rotating Credentials Demo</h1>
          <p className="text-zinc-500">
            One agent holds a static M2M token. The other rotates before every window closes.
          </p>
        </div>
        <div className="flex flex-col gap-6 sm:flex-row">
          <ModeCard mode="static" />
          <ModeCard mode="rotating" />
        </div>
        <LeakProof />
      </main>
    </div>
  );
}
