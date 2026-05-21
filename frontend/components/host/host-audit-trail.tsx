"use client";

import { useState } from "react";

import type { AuditEvent } from "@/types/audit";

const COLLAPSED_ENTRY_COUNT = 3;

function formatEventLabel(eventType: string) {
  return eventType.replaceAll("_", " ");
}

function formatTimestamp(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

type HostAuditTrailProps = Readonly<{
  events: AuditEvent[];
  loading: boolean;
  error: string | null;
}>;

export function HostAuditTrail({ events, loading, error }: HostAuditTrailProps) {
  const [expanded, setExpanded] = useState(false);
  const hasMoreThanCollapsed = events.length > COLLAPSED_ENTRY_COUNT;
  const visibleEvents = expanded
    ? events
    : events.slice(0, COLLAPSED_ENTRY_COUNT);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-black text-white">Audit trail</h3>
        <p className="mt-1 text-sm text-slate-400">
          A readable timeline of what happened in this game room. New rows appear
          live while you stay connected.
        </p>
      </div>

      {loading && events.length === 0 ? (
        <p className="text-sm font-semibold text-slate-400">Loading audit trail…</p>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-300/30 bg-red-500/10 p-3 text-sm font-semibold text-red-100">
          {error}
        </div>
      ) : null}

      {!loading && !error && events.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-400">
          No events recorded yet. Create the game, generate items, invite players,
          and play — each step will show up here.
        </p>
      ) : null}

      {events.length > 0 ? (
        <>
          <ol className="relative ms-2 space-y-5 border-l-2 border-white/15 ps-6">
            {visibleEvents.map((ev) => (
              <li className="relative" key={ev.id}>
                <span
                  aria-hidden
                  className="absolute -start-[25px] top-2 size-3 rounded-full border-2 border-slate-950 bg-yellow-300"
                />
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-yellow-200/90">
                  {formatEventLabel(ev.event_type)}
                </p>
                <p className="mt-1 text-sm font-semibold text-white">{ev.message}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatTimestamp(ev.created_at)}
                </p>
              </li>
            ))}
          </ol>

          {hasMoreThanCollapsed ? (
            <button
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-200 transition hover:border-white/25 hover:bg-white/10"
              onClick={() => setExpanded((current) => !current)}
              type="button"
            >
              {expanded
                ? "Show less"
                : `Show all (${events.length})`}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
