/** Public host voice profile from GET /games/{game_id}/voice/profile */

export type HostVoiceMode = "DEFAULT" | "HOST_VOICE";
export type HostVoiceProvider = "DEMO" | "ELEVENLABS" | "AZURE";

export type HostVoiceProfilePublic = {
  voice_mode: HostVoiceMode;
  consent_given: boolean;
  provider: HostVoiceProvider;
  active: boolean;
  demo_mode: boolean;
};

export type HostVoiceConsentPayload = {
  consent_given: boolean;
  consent_text: string;
};

export type HostVoiceDeactivateResult = {
  success: boolean;
};

export type HostVoiceSampleResult = {
  demo_mode: boolean;
  active: boolean;
  provider?: HostVoiceProvider;
  error?: string | null;
};
