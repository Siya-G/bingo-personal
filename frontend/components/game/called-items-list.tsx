"use client";

import { useState } from "react";

import type { CalledItem } from "@/types/gameplay";

const COLLAPSED_PREVIOUS_COUNT = 3;

type CalledItemsListProps = Readonly<{
  items: CalledItem[];
}>;

export function CalledItemsList({ items }: CalledItemsListProps) {
  const [expanded, setExpanded] = useState(false);
  const currentItem = items.at(-1) ?? null;
  const previousItems = items.slice(0, -1).reverse();
  const hasMoreThanCollapsed = previousItems.length > COLLAPSED_PREVIOUS_COUNT;
  const visiblePrevious = expanded
    ? previousItems
    : previousItems.slice(0, COLLAPSED_PREVIOUS_COUNT);

  return (
    <div className="space-y-5">
      <div className="rounded-[2rem] border border-yellow-200/20 bg-yellow-300 p-6 text-center text-slate-950 shadow-xl shadow-yellow-500/20">
        <p className="text-sm font-black uppercase tracking-[0.28em]">
          Now Calling
        </p>
        <p className="mt-3 text-4xl font-black sm:text-5xl">
          {currentItem?.word ?? "Waiting"}
        </p>
        <p className="mx-auto mt-3 max-w-xl text-sm font-semibold text-slate-800">
          {currentItem?.description ??
            "Start the game and call the first item when everyone is ready."}
        </p>
      </div>

      <div>
        <h3 className="text-lg font-black text-white">Previous Calls</h3>
        <div className="mt-3 space-y-3">
          {previousItems.length > 0 ? (
            <>
              {visiblePrevious.map((item) => (
                <div
                  key={`${item.called_order}-${item.item_id}`}
                  className="rounded-2xl bg-slate-950/45 p-4"
                >
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-yellow-200">
                    Call #{item.called_order}
                  </p>
                  <p className="mt-1 font-bold text-white">{item.word}</p>
                  <p className="mt-1 text-sm text-slate-400">{item.description}</p>
                </div>
              ))}
              {hasMoreThanCollapsed ? (
                <button
                  className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-200 transition hover:border-white/25 hover:bg-white/10"
                  onClick={() => setExpanded((current) => !current)}
                  type="button"
                >
                  {expanded
                    ? "Show less"
                    : `Show all (${previousItems.length})`}
                </button>
              ) : null}
            </>
          ) : (
            <div className="rounded-2xl bg-slate-950/45 p-4 text-sm font-semibold text-slate-300">
              No previous calls yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
