import type { CalledItem } from "@/types/gameplay";

/** Format a called Bingo item for SpeechSynthesis. */
export function formatCalledItemForSpeech(item: CalledItem): string {
  const fact = item.description?.trim();
  if (fact) {
    return `${item.word}. ${fact}`;
  }
  return item.word;
}
