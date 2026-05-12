import type { CalledItem } from "@/types/gameplay";

/** Append a new call if we do not already have this order (host + WS can overlap). */
export function mergeCalledItems(
  previous: CalledItem[],
  incoming: CalledItem,
): CalledItem[] {
  const exists = previous.some(
    (row) =>
      row.item_id === incoming.item_id &&
      row.called_order === incoming.called_order,
  );
  if (exists) {
    return previous;
  }
  return [...previous, incoming].sort((a, b) => a.called_order - b.called_order);
}
