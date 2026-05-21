"use client";

import { useCallback, useEffect, useState, startTransition } from "react";
import { getHostVoiceProfile } from "@/lib/api/host-voice";
import { HOST_VOICE_PROFILE_CHANGED_EVENT } from "@/lib/live-game-session";
import { describeVoiceMode } from "@/lib/narrate-called-item";
import type { HostVoiceProfilePublic } from "@/types/host-voice";

const VOICE_PROFILE_UNAVAILABLE_WARNING =
  "Host voice profile could not be loaded. Default browser narration will still work.";

export function useHostVoiceProfile(gameId: string, hostPin: string) {
  const [profile, setProfile] = useState<HostVoiceProfilePublic | null>(null);
  const [isLoadingVoiceProfile, setIsLoadingVoiceProfile] = useState(false);
  const [voiceWarning, setVoiceWarning] = useState<string | null>(null);

  const selectedVoiceMode = describeVoiceMode(profile);

  const refreshProfile = useCallback(async (): Promise<HostVoiceProfilePublic | null> => {
    const trimmedGameId = gameId.trim();
    const trimmedPin = hostPin.trim();
    if (!trimmedGameId || !trimmedPin) {
      startTransition(() => {
        setProfile(null);
        setVoiceWarning(null);
        setIsLoadingVoiceProfile(false);
      });
      return null;
    }

    setIsLoadingVoiceProfile(true);
    try {
      const nextProfile = await getHostVoiceProfile(trimmedGameId, trimmedPin);
      startTransition(() => {
        setProfile(nextProfile);
        setVoiceWarning(null);
      });
      return nextProfile;
    } catch {
      startTransition(() => {
        setProfile(null);
        setVoiceWarning(VOICE_PROFILE_UNAVAILABLE_WARNING);
      });
      return null;
    } finally {
      startTransition(() => {
        setIsLoadingVoiceProfile(false);
      });
    }
  }, [gameId, hostPin]);

  useEffect(() => {
    queueMicrotask(() => {
      void refreshProfile();
    });
  }, [refreshProfile]);

  useEffect(() => {
    const onProfileChanged = () => {
      void refreshProfile();
    };
    window.addEventListener(HOST_VOICE_PROFILE_CHANGED_EVENT, onProfileChanged);
    return () => {
      window.removeEventListener(
        HOST_VOICE_PROFILE_CHANGED_EVENT,
        onProfileChanged,
      );
    };
  }, [refreshProfile]);

  return {
    profile,
    refreshProfile,
    isLoadingVoiceProfile,
    voiceWarning,
    selectedVoiceMode,
  };
}
