"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CalledItem } from "@/types/gameplay";
import {
  readHostVoiceSettings,
  writeHostVoiceSettings,
  type HostVoiceSettings,
} from "@/lib/host-voice-settings";
import { formatCalledItemForSpeech } from "@/lib/speech-utils";

export type UseSpeechSynthesisResult = {
  supported: boolean;
  voices: SpeechSynthesisVoice[];
  settings: HostVoiceSettings;
  isSpeaking: boolean;
  setVoiceName: (name: string) => void;
  setRate: (rate: number) => void;
  setPitch: (pitch: number) => void;
  setVolume: (volume: number) => void;
  setNarrationEnabled: (enabled: boolean) => void;
  /** Cancel any in-progress speech (e.g. before a new call). */
  cancel: () => void;
  /**
   * Speak arbitrary text using persisted host voice settings.
   * Use `force: true` to ignore the narration toggle (e.g. explicit replay).
   */
  speak: (text: string, options?: { force?: boolean }) => void;
  speakCalledItem: (item: CalledItem, options?: { force?: boolean }) => void;
};

function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.speechSynthesis ?? null;
}

export function useSpeechSynthesis(): UseSpeechSynthesisResult {
  const [supported, setSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [settings, setSettings] = useState<HostVoiceSettings>(() =>
    readHostVoiceSettings(),
  );
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const refreshSettings = useCallback(() => {
    setSettings(readHostVoiceSettings());
  }, []);

  const loadVoices = useCallback(() => {
    const synth = getSpeechSynthesis();
    if (!synth) {
      setVoices([]);
      return;
    }
    const list = synth.getVoices();
    setVoices(list);
  }, []);

  useEffect(() => {
    let alive = true;

    queueMicrotask(() => {
      if (!alive) {
        return;
      }

      const synth = getSpeechSynthesis();
      setSupported(Boolean(synth));

      if (!synth) {
        return;
      }

      loadVoices();

      const onVoicesChanged = () => loadVoices();
      synth.addEventListener("voiceschanged", onVoicesChanged);

      const onHostVoiceChanged = () => refreshSettings();
      window.addEventListener("ai-bingo-host-voice-changed", onHostVoiceChanged);

      cleanupRef.current = () => {
        synth.removeEventListener("voiceschanged", onVoicesChanged);
        window.removeEventListener(
          "ai-bingo-host-voice-changed",
          onHostVoiceChanged,
        );
      };
    });

    return () => {
      alive = false;
      cleanupRef.current?.();
      cleanupRef.current = null;
      getSpeechSynthesis()?.cancel();
    };
  }, [loadVoices, refreshSettings]);

  const cancel = useCallback(() => {
    const synth = getSpeechSynthesis();
    if (!synth) {
      return;
    }
    synth.cancel();
    utteranceRef.current = null;
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string, options?: { force?: boolean }) => {
      const synth = getSpeechSynthesis();
      if (!synth || !text.trim()) {
        return;
      }

      const current = readHostVoiceSettings();
      if (!options?.force && !current.narrationEnabled) {
        return;
      }

      synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utteranceRef.current = utterance;
      utterance.rate = current.rate;
      utterance.pitch = current.pitch;
      utterance.volume = current.volume;

      const voiceList = synth.getVoices();
      const match = current.voiceName
        ? voiceList.find((voice) => voice.name === current.voiceName)
        : undefined;
      if (match) {
        utterance.voice = match;
      }

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        utteranceRef.current = null;
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        utteranceRef.current = null;
      };

      synth.speak(utterance);
    },
    [],
  );

  const speakCalledItem = useCallback(
    (item: CalledItem, options?: { force?: boolean }) => {
      speak(formatCalledItemForSpeech(item), options);
    },
    [speak],
  );

  const setVoiceName = useCallback((name: string) => {
    writeHostVoiceSettings({ voiceName: name });
    refreshSettings();
  }, [refreshSettings]);

  const setRate = useCallback((rate: number) => {
    writeHostVoiceSettings({ rate });
    refreshSettings();
  }, [refreshSettings]);

  const setPitch = useCallback((pitch: number) => {
    writeHostVoiceSettings({ pitch });
    refreshSettings();
  }, [refreshSettings]);

  const setVolume = useCallback((volume: number) => {
    writeHostVoiceSettings({ volume });
    refreshSettings();
  }, [refreshSettings]);

  const setNarrationEnabled = useCallback((enabled: boolean) => {
    writeHostVoiceSettings({ narrationEnabled: enabled });
    refreshSettings();
  }, [refreshSettings]);

  return {
    supported,
    voices,
    settings,
    isSpeaking,
    setVoiceName,
    setRate,
    setPitch,
    setVolume,
    setNarrationEnabled,
    cancel,
    speak,
    speakCalledItem,
  };
}
