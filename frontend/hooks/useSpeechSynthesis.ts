"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CalledItem } from "@/types/gameplay";
import {
  readHostVoiceSettings,
  writeHostVoiceSettings,
  type HostVoiceSettings,
} from "@/lib/host-voice-settings";
import {
  cancelBingoSpeech,
  isSpeechSynthesisAvailable,
  speakBingoItem,
  speakNarrationText,
} from "@/lib/speak-bingo-item";

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
  cancel: () => void;
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
    setVoices(synth.getVoices());
  }, []);

  useEffect(() => {
    let alive = true;

    queueMicrotask(() => {
      if (!alive) {
        return;
      }

      setSupported(isSpeechSynthesisAvailable());

      const synth = getSpeechSynthesis();
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
    };
  }, [loadVoices, refreshSettings]);

  const onSpeakingChange = useCallback((speaking: boolean) => {
    setIsSpeaking(speaking);
  }, []);

  const cancel = useCallback(() => {
    cancelBingoSpeech();
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string, options?: { force?: boolean }) => {
      speakNarrationText(text, { ...options, onSpeakingChange });
    },
    [onSpeakingChange],
  );

  const speakCalledItem = useCallback(
    (item: CalledItem, options?: { force?: boolean }) => {
      speakBingoItem(item.word, item.description, {
        ...options,
        onSpeakingChange,
      });
    },
    [onSpeakingChange],
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
