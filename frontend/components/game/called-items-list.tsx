import type { CalledItem } from "@/types/gameplay";

type CalledItemsListProps = Readonly<{
  items: CalledItem[];
}>;

export function CalledItemsList({ items }: CalledItemsListProps) {
  const currentItem = items.at(-1) ?? null;
  const previousItems = items.slice(0, -1).reverse();

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
            previousItems.map((item) => (
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
            ))
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
