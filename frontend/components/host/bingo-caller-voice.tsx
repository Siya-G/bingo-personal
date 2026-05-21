"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  startTransition,
} from "react";

import { ErrorMessage } from "@/components/ui/error-message";
import { LoadingState } from "@/components/ui/loading-state";
import {
  deleteHostVoiceProfile,
  getHostVoiceProfile,
  postHostVoiceConsent,
  postHostVoiceSample,
} from "@/lib/api/host-voice";
import { getHostVoiceSettingsLabel } from "@/lib/narrate-called-item";
import { notifyHostVoiceProfileChanged } from "@/lib/live-game-session";
import type {
  HostVoiceProfilePublic,
  HostVoiceSampleResult,
} from "@/types/host-voice";

/** Exact consent wording shown in the modal and sent to the API. */
export const HOST_VOICE_CONSENT_TEXT =
  "I consent to using my recorded voice for AI-generated Bingo narration during this game session.";

const RECORDING_SCRIPT =
  "Welcome to Virtual Bingo. Today's game will begin shortly. Good luck everyone. This AI voice profile is generated with my consent.";

const UPLOAD_SUCCESS_CLONED =
  "✅ Your voice has been cloned. Items will be called in your voice.";

const UPLOAD_SUCCESS_FALLBACK =
  "⚠️ Voice cloning unavailable. Browser voice will be used instead.";

const RECORDING_TARGET_MIN_SEC = 15;
const RECORDING_TARGET_MAX_SEC = 30;

type VoiceChoice = "default" | "host_voice";
type RecordingPhase = "idle" | "recording" | "stopped";

const DEFAULT_PROFILE: HostVoiceProfilePublic = {
  voice_mode: "DEFAULT",
  consent_given: false,
  provider: "DEMO",
  active: false,
  demo_mode: true,
};

function canUseMediaRecorder(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

function choiceFromProfile(profile: HostVoiceProfilePublic): VoiceChoice {
  if (profile.voice_mode === "HOST_VOICE") {
    return "host_voice";
  }
  return "default";
}

type VoiceRecordingPanelProps = Readonly<{
  disabled: boolean;
  gameId: string;
  hostPin: string;
  onPermissionDenied: () => void;
  onUploadSuccess: (result: HostVoiceSampleResult) => void;
  onUploadError: (message: string) => void;
}>;

function VoiceRecordingPanel({
  disabled,
  gameId,
  hostPin,
  onPermissionDenied,
  onUploadSuccess,
  onUploadError,
}: VoiceRecordingPanelProps) {
  const [phase, setPhase] = useState<RecordingPhase>("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const revokePreviewUrl = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }, [previewUrl]);

  const stopStreamTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetRecording = useCallback(() => {
    clearTimer();
    stopStreamTracks();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    revokePreviewUrl();
    setRecordedBlob(null);
    setElapsedSec(0);
    setPhase("idle");
  }, [clearTimer, revokePreviewUrl, stopStreamTracks]);

  useEffect(() => {
    return () => {
      clearTimer();
      stopStreamTracks();
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [clearTimer, previewUrl, stopStreamTracks]);

  async function handleStartRecording() {
    resetRecording();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : undefined;

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        setRecordedBlob(blob);
        setPhase("stopped");
        stopStreamTracks();
      };

      recorder.start();
      setPhase("recording");
      setElapsedSec(0);
      timerRef.current = setInterval(() => {
        setElapsedSec((prev) => prev + 1);
      }, 1000);
    } catch (caught) {
      resetRecording();
      const name = caught instanceof Error ? caught.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        onPermissionDenied();
        return;
      }
      onUploadError(
        caught instanceof Error
          ? caught.message
          : "Unable to start recording. Check your microphone.",
      );
    }
  }

  function handleStopRecording() {
    clearTimer();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      stopStreamTracks();
      setPhase("idle");
    }
  }

  function handlePreview() {
    if (!recordedBlob) {
      return;
    }
    revokePreviewUrl();
    const url = URL.createObjectURL(recordedBlob);
    setPreviewUrl(url);
    const audio = previewAudioRef.current;
    if (audio) {
      audio.src = url;
      void audio.play().catch(() => {
        onUploadError("Unable to play the preview. Try again.");
      });
    }
  }

  async function handleUseVoice() {
    if (!recordedBlob) {
      return;
    }
    setUploading(true);
    try {
      const result = await postHostVoiceSample(gameId, hostPin, recordedBlob);
      resetRecording();
      onUploadSuccess(result);
    } catch (caught) {
      onUploadError(
        caught instanceof Error
          ? caught.message
          : "Unable to upload the voice sample.",
      );
    } finally {
      setUploading(false);
    }
  }

  const timerHint =
    phase === "recording"
      ? elapsedSec < RECORDING_TARGET_MIN_SEC
        ? `Recording… ${elapsedSec}s (aim for ${RECORDING_TARGET_MIN_SEC}–${RECORDING_TARGET_MAX_SEC}s)`
        : elapsedSec <= RECORDING_TARGET_MAX_SEC
          ? `Recording… ${elapsedSec}s`
          : `Recording… ${elapsedSec}s (you can stop now)`
      : null;

  return (
    <div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/5 p-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">
        Record your voice sample
      </p>
      <p className="mt-3 rounded-xl bg-slate-950/50 p-3 text-sm leading-relaxed text-slate-200">
        {RECORDING_SCRIPT}
      </p>

      {timerHint ? (
        <p className="mt-3 text-xs font-semibold text-cyan-100/90" role="status">
          {timerHint}
        </p>
      ) : null}

      <audio className="sr-only" ref={previewAudioRef} />

      <div className="mt-4 flex flex-wrap gap-2">
        {phase === "idle" ? (
          <button
            className="rounded-full bg-cyan-400 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={disabled || uploading}
            onClick={() => void handleStartRecording()}
            type="button"
          >
            Start Recording
          </button>
        ) : null}

        {phase === "recording" ? (
          <button
            className="rounded-full border border-red-300/40 bg-red-500/20 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-red-100 transition hover:bg-red-500/30 disabled:opacity-60"
            disabled={disabled || uploading}
            onClick={handleStopRecording}
            type="button"
          >
            Stop Recording
          </button>
        ) : null}

        {phase === "stopped" ? (
          <>
            <button
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-200 transition hover:bg-white/10 disabled:opacity-60"
              disabled={disabled || uploading}
              onClick={handlePreview}
              type="button"
            >
              Preview Recording
            </button>
            <button
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-200 transition hover:bg-white/10 disabled:opacity-60"
              disabled={disabled || uploading}
              onClick={resetRecording}
              type="button"
            >
              Re-record
            </button>
            <button
              className="rounded-full bg-yellow-300 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-950 shadow-lg shadow-yellow-500/30 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={disabled || uploading}
              onClick={() => void handleUseVoice()}
              type="button"
            >
              {uploading ? "Uploading…" : "Use this voice"}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

type BingoCallerVoiceProps = Readonly<{
  /** From Live Gameplay on /host (session-synced). */
  gameId?: string;
  hostPin?: string;
  /** When true, hide Game ID / PIN fields (credentials come from Live Gameplay). */
  embedded?: boolean;
}>;

export function BingoCallerVoice({
  gameId: gameIdProp = "",
  hostPin: hostPinProp = "",
  embedded = false,
}: BingoCallerVoiceProps) {
  const [profile, setProfile] = useState<HostVoiceProfilePublic>(DEFAULT_PROFILE);
  const [choice, setChoice] = useState<VoiceChoice>("default");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentSubmitting, setConsentSubmitting] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [savedStatus, setSavedStatus] = useState<string | null>(null);
  const [showRecordingPanel, setShowRecordingPanel] = useState(false);
  const recordingSupported = canUseMediaRecorder();

  const trimmedGameId = gameIdProp.trim();
  const trimmedPin = hostPinProp.trim();
  const canCallApi = Boolean(trimmedGameId && trimmedPin);

  const displayRecordingPanel =
    recordingSupported &&
    canCallApi &&
    choice === "host_voice" &&
    profile.consent_given &&
    (!profile.active || showRecordingPanel);

  const loadProfile = useCallback(async (): Promise<HostVoiceProfilePublic> => {
    if (!canCallApi) {
      startTransition(() => {
        setProfile(DEFAULT_PROFILE);
        setChoice("default");
        setError(null);
        setSavedStatus(null);
        setShowRecordingPanel(false);
      });
      return DEFAULT_PROFILE;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await getHostVoiceProfile(trimmedGameId, trimmedPin);
      startTransition(() => {
        setProfile(data);
        setChoice(choiceFromProfile(data));
        if (!data.active) {
          setSavedStatus(null);
        }
      });
      notifyHostVoiceProfileChanged();
      return data;
    } catch (caught) {
      startTransition(() => {
        setProfile(DEFAULT_PROFILE);
        setChoice("default");
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load host voice settings.",
        );
      });
      return DEFAULT_PROFILE;
    } finally {
      setLoading(false);
    }
  }, [canCallApi, trimmedGameId, trimmedPin]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  function revertToDefaultVoice(message: string) {
    setError(message);
    setChoice("default");
    setShowRecordingPanel(false);
    setSavedStatus(null);
  }

  function handleSelectDefault() {
    setChoice("default");
    setModalOpen(false);
    setConsentChecked(false);
    setShowRecordingPanel(false);
  }

  function handleSelectHostVoice() {
    if (!recordingSupported) {
      revertToDefaultVoice(
        "Your browser does not support audio recording. Using default AI voice.",
      );
      return;
    }
    if (profile.voice_mode === "HOST_VOICE" && profile.consent_given) {
      setChoice("host_voice");
      return;
    }
    setModalOpen(true);
    setConsentChecked(false);
  }

  function handleModalCancel() {
    setModalOpen(false);
    setConsentChecked(false);
    setChoice("default");
  }

  async function handleModalAgree() {
    if (!canCallApi || !consentChecked) {
      return;
    }
    if (!recordingSupported) {
      revertToDefaultVoice(
        "Your browser does not support audio recording. Using default AI voice.",
      );
      setModalOpen(false);
      return;
    }
    setConsentSubmitting(true);
    setError(null);
    try {
      await postHostVoiceConsent(trimmedGameId, trimmedPin, {
        consent_given: true,
        consent_text: HOST_VOICE_CONSENT_TEXT,
      });
      setModalOpen(false);
      setConsentChecked(false);
      await loadProfile();
      setChoice("host_voice");
      setShowRecordingPanel(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save host voice consent.",
      );
      setChoice("default");
    } finally {
      setConsentSubmitting(false);
    }
  }

  async function handleDeactivate() {
    if (!canCallApi) {
      return;
    }
    setDeactivating(true);
    setError(null);
    try {
      await deleteHostVoiceProfile(trimmedGameId, trimmedPin);
      setChoice("default");
      setShowRecordingPanel(false);
      setSavedStatus(null);
      await loadProfile();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to deactivate host voice.",
      );
    } finally {
      setDeactivating(false);
    }
  }

  function handleUploadSuccess(result: HostVoiceSampleResult) {
    setShowRecordingPanel(false);
    if (!result.demo_mode && result.active) {
      setSavedStatus(UPLOAD_SUCCESS_CLONED);
    } else {
      setSavedStatus(UPLOAD_SUCCESS_FALLBACK);
    }
    void loadProfile();
  }

  const statusLine = savedStatus ?? getHostVoiceSettingsLabel(profile);

  return (
    <div className="space-y-4">
      {!embedded ? (
        <>
          <p className="text-xs text-slate-400">
            Enter the game ID and host PIN from Live Gameplay. Voice settings
            load automatically when both are set.
          </p>
        </>
      ) : !canCallApi ? (
        <p className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-400">
          Enter your <strong className="text-slate-200">Game ID</strong> and{" "}
          <strong className="text-slate-200">Host PIN</strong> in{" "}
          <strong className="text-slate-200">Live Gameplay</strong> below (e.g.{" "}
          Game ID: 40). This section will load your voice profile automatically.
          {trimmedGameId && !trimmedPin ? (
            <span className="mt-2 block text-amber-200/90">
              Game ID {trimmedGameId} is set — add the host PIN in Live Gameplay
              to enable &quot;Use my voice&quot;.
            </span>
          ) : null}
        </p>
      ) : (
        <p className="text-xs text-slate-500">
          Using game ID <strong className="text-slate-300">{trimmedGameId}</strong>{" "}
          from Live Gameplay.
        </p>
      )}

      <LoadingState active={loading} label="Loading voice profile…" />
      <ErrorMessage message={error} title="Voice settings error" />

      <fieldset className="space-y-3" disabled={!canCallApi || loading}>
        <legend className="sr-only">Bingo caller voice</legend>

        <label
          className={[
            "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition",
            choice === "default"
              ? "border-yellow-300/50 bg-yellow-300/10"
              : "border-white/10 bg-slate-950/40 hover:border-white/20",
          ].join(" ")}
        >
          <input
            checked={choice === "default"}
            className="mt-1 accent-yellow-300"
            name="bingo-caller-voice"
            onChange={handleSelectDefault}
            type="radio"
          />
          <span>
            <span className="block text-sm font-bold text-white">
              Default browser voice
            </span>
            <span className="mt-1 block text-xs text-slate-400">
              Uses the browser voice dropdown and sliders above for narration.
            </span>
          </span>
        </label>

        <label
          className={[
            "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition",
            choice === "host_voice"
              ? "border-cyan-300/50 bg-cyan-500/10"
              : "border-white/10 bg-slate-950/40 hover:border-white/20",
          ].join(" ")}
        >
          <input
            checked={choice === "host_voice"}
            className="mt-1 accent-cyan-300"
            name="bingo-caller-voice"
            onChange={handleSelectHostVoice}
            type="radio"
          />
          <span>
            <span className="block text-sm font-bold text-white">Use my voice</span>
            <span className="mt-1 block text-xs text-slate-400">
              Record a short sample. Items will be called in your cloned AI voice.
            </span>
          </span>
        </label>
      </fieldset>

      {displayRecordingPanel && canCallApi ? (
        <VoiceRecordingPanel
          disabled={loading || consentSubmitting}
          gameId={trimmedGameId}
          hostPin={trimmedPin}
          onPermissionDenied={() =>
            revertToDefaultVoice(
              "Microphone access was denied. Using default AI voice instead.",
            )
          }
          onUploadError={(message) => setError(message)}
          onUploadSuccess={handleUploadSuccess}
        />
      ) : null}

      {statusLine ? (
        <p
          className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-100"
          role="status"
        >
          {statusLine}
        </p>
      ) : null}

      {profile.active ? (
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-full border border-cyan-300/30 bg-cyan-500/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-cyan-100 transition hover:bg-cyan-500/20 disabled:opacity-60"
            disabled={deactivating || loading || !canCallApi || !recordingSupported}
            onClick={() => {
              setShowRecordingPanel(true);
              setSavedStatus(null);
            }}
            type="button"
          >
            Re-record
          </button>
          <button
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-200 transition hover:border-white/25 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={deactivating || loading || !canCallApi}
            onClick={() => void handleDeactivate()}
            type="button"
          >
            {deactivating ? "Switching…" : "Use default voice instead"}
          </button>
        </div>
      ) : null}

      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
          role="presentation"
        >
          <div
            aria-labelledby="host-voice-consent-title"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
            role="dialog"
          >
            <h3
              className="text-xl font-black text-white"
              id="host-voice-consent-title"
            >
              Use Your Voice for Bingo Narration
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Your voice will be recorded and used only for AI-generated Bingo
              narration during this game session. Your sample is stored securely
              and used to call items in your voice for this game only.
            </p>

            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
              <input
                checked={consentChecked}
                className="mt-1 accent-yellow-300"
                onChange={(event) => setConsentChecked(event.target.checked)}
                type="checkbox"
              />
              <span className="text-sm text-slate-200">{HOST_VOICE_CONSENT_TEXT}</span>
            </label>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                className="rounded-full border border-white/15 px-5 py-2 text-sm font-bold text-slate-200 transition hover:bg-white/10"
                disabled={consentSubmitting}
                onClick={handleModalCancel}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-full bg-yellow-300 px-5 py-2 text-sm font-black uppercase tracking-[0.14em] text-slate-950 shadow-lg shadow-yellow-500/30 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!consentChecked || consentSubmitting}
                onClick={() => void handleModalAgree()}
                type="button"
              >
                {consentSubmitting ? "Saving…" : "I agree"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
