/** API-aligned winning pattern codes and display labels for host/player UI. */

export type WinningPattern =
  | "HORIZONTAL_ROW"
  | "VERTICAL_COLUMN"
  | "DIAGONAL"
  | "FOUR_CORNERS"
  | "FULL_HOUSE";

export const WINNING_PATTERN_OPTIONS: ReadonlyArray<{
  label: string;
  value: WinningPattern;
}> = [
  { label: "Horizontal row", value: "HORIZONTAL_ROW" },
  { label: "Vertical column", value: "VERTICAL_COLUMN" },
  { label: "Diagonal", value: "DIAGONAL" },
  { label: "Four corners", value: "FOUR_CORNERS" },
  { label: "Full house", value: "FULL_HOUSE" },
];

const LABEL_BY_VALUE: Record<string, string> = Object.fromEntries(
  WINNING_PATTERN_OPTIONS.map((o) => [o.value, o.label]),
);

export function winningPatternLabel(code: string): string {
  return LABEL_BY_VALUE[code] ?? code.replace(/_/g, " ").toLowerCase();
}

export function formatWinningPatternsList(patterns: string[]): string {
  if (!patterns.length) {
    return "";
  }
  return patterns.map(winningPatternLabel).join(", ");
}

export function sortPatternsByOptionOrder(patterns: WinningPattern[]): WinningPattern[] {
  const order = new Map(
    WINNING_PATTERN_OPTIONS.map((o, i) => [o.value, i] as const),
  );
  return [...patterns].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
}
