"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { getSmtpHealth, sendGameInvites } from "@/lib/api/games";
import { ErrorMessage } from "@/components/ui/error-message";
import { LoadingState } from "@/components/ui/loading-state";
import type {
  GameInviteRecipient,
  GameInvitesResult,
  SmtpHealth,
} from "@/types/invite";

function parseParticipantEmails(raw: string): string[] {
  const tokens = raw
    .split(/[\n,;\t]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(tokens)];
}

function fullInviteText(result: GameInvitesResult): string {
  return `${result.subject}\n\n${result.body_preview}`;
}

function recipientStatusBadgeClass(r: GameInviteRecipient): string {
  switch (r.invite_status) {
    case "SENT":
      return "bg-emerald-400/15 text-emerald-200 border border-emerald-300/30";
    case "FAILED":
      return "bg-rose-500/15 text-rose-200 border border-rose-400/30";
    default:
      return "bg-cyan-400/15 text-cyan-200 border border-cyan-300/30";
  }
}

type TeamsInvitesPanelProps = {
  gameId: number;
  gameTitle: string;
  gameTopic: string | null;
  hostPin: string;
};

export function TeamsInvitesPanel({
  gameId,
  gameTitle,
  gameTopic,
  hostPin,
}: TeamsInvitesPanelProps) {
  const [emailsRaw, setEmailsRaw] = useState("");
  const [teamsUrl, setTeamsUrl] = useState("");
  const [scheduledLocal, setScheduledLocal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GameInvitesResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copyFlash, setCopyFlash] = useState<string | null>(null);
  const [smtpHealth, setSmtpHealth] = useState<SmtpHealth | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getSmtpHealth()
      .then((health) => {
        if (!cancelled) {
          setSmtpHealth(health);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSmtpHealth(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const copy = useCallback(async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFlash(label);
      window.setTimeout(() => setCopyFlash(null), 2000);
    } catch {
      setError("Could not copy to the clipboard (permission denied).");
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    const pin = hostPin.trim();
    if (!pin) {
      setError(
        "Host PIN is missing from this form session. Recreate the game or re-enter your PIN in the create step.",
      );
      return;
    }

    const participant_emails = parseParticipantEmails(emailsRaw);
    if (participant_emails.length === 0) {
      setError("Add at least one participant email (one per line or comma-separated).");
      return;
    }

    const teams_join_url = teamsUrl.trim();
    if (!teams_join_url) {
      setError("Paste the Microsoft Teams meeting link (must start with https://).");
      return;
    }

    let scheduled_start_time: string | undefined;
    if (scheduledLocal.trim()) {
      const d = new Date(scheduledLocal);
      if (Number.isNaN(d.getTime())) {
        setError("Start time is not a valid date.");
        return;
      }
      scheduled_start_time = d.toISOString();
    }

    setIsSubmitting(true);
    try {
      const res = await sendGameInvites(String(gameId), pin, {
        participant_emails,
        teams_join_url,
        scheduled_start_time,
      });
      setResult(res);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to send invites.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const smtpModeBadge = smtpHealth
    ? smtpHealth.configured
      ? {
          label: "SMTP live send",
          className:
            "bg-emerald-400/15 text-emerald-200 border border-emerald-300/30",
        }
      : {
          label: "Preview mode",
          className: "bg-cyan-400/15 text-cyan-200 border border-cyan-300/30",
        }
    : {
        label: "Checking SMTP…",
        className: "bg-slate-700/40 text-slate-300 border border-white/10",
      };

  return (
    <div className="mt-6 rounded-3xl border border-cyan-400/25 bg-slate-950/55 p-5 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-xl font-black text-white">Send Teams Invites</h3>
          <p className="mt-2 text-sm text-slate-400">
            {smtpHealth?.configured
              ? "Live SMTP is configured on the server. Submitting this form sends real emails to each recipient."
              : "Without SMTP settings on the server, invites are saved as preview and the email text appears below for copy-paste into Outlook or Teams chat."}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] ${smtpModeBadge.className}`}
        >
          {smtpModeBadge.label}
        </span>
      </div>

      {smtpHealth?.configured ? (
        <p className="mt-3 text-xs text-emerald-300/80">
          SMTP Configured{" "}
          {smtpHealth.host ? (
            <>
              · host{" "}
              <code className="rounded bg-slate-900/70 px-1.5 py-0.5 text-emerald-200">
                {smtpHealth.host}
              </code>
            </>
          ) : null}
          {smtpHealth.port ? <> · port {smtpHealth.port}</> : null}
          {smtpHealth.use_ssl ? " · SSL" : smtpHealth.use_tls ? " · TLS" : null}
          {smtpHealth.has_credentials ? " · auth" : " · no auth"}
        </p>
      ) : smtpHealth ? (
        <p className="mt-3 text-xs text-cyan-200/80">
          SMTP is not configured on the backend. Set{" "}
          <code className="rounded bg-slate-900/70 px-1.5 py-0.5 text-cyan-100">
            SMTP_HOST
          </code>
          ,{" "}
          <code className="rounded bg-slate-900/70 px-1.5 py-0.5 text-cyan-100">
            SMTP_FROM
          </code>{" "}
          (and credentials) in <code>backend/.env</code> and restart the API to
          enable real sending.
        </p>
      ) : null}

      <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
        <label className="block">
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
            Participant emails
          </span>
          <textarea
            className="mt-2 min-h-[120px] w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70"
            onChange={(e) => setEmailsRaw(e.target.value)}
            placeholder={"alex@company.com\nsam@company.com"}
            value={emailsRaw}
          />
          <p className="mt-1 text-xs text-slate-500">
            One per line, or comma-separated. Duplicates are removed automatically.
          </p>
        </label>

        <label className="block">
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
            Teams meeting link
          </span>
          <input
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70"
            onChange={(e) => setTeamsUrl(e.target.value)}
            placeholder="https://teams.microsoft.com/l/meetup-join/..."
            type="text"
            value={teamsUrl}
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
            Scheduled start (optional)
          </span>
          <input
            className="mt-2 w-full max-w-md rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-white outline-none focus:border-cyan-300/70"
            onChange={(e) => setScheduledLocal(e.target.value)}
            type="datetime-local"
            value={scheduledLocal}
          />
        </label>

        <LoadingState active={isSubmitting} label="Processing invites…" />

        <button
          className="rounded-full bg-cyan-400 px-5 py-3.5 text-sm font-black uppercase tracking-[0.16em] text-slate-950 shadow-lg shadow-cyan-900/30 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          Send Invites
        </button>
      </form>

      <div className="mt-4">
        <ErrorMessage message={error} title="Could not process invites" />
      </div>

      {copyFlash ? (
        <p className="mt-3 text-xs font-bold text-emerald-300" role="status">
          Copied: {copyFlash}
        </p>
      ) : null}

      {result ? (
        <div
          className={`mt-6 space-y-4 rounded-2xl border p-4 ${
            result.mode === "sent"
              ? "border-emerald-400/30 bg-emerald-500/10"
              : "border-cyan-400/30 bg-cyan-500/10"
          }`}
        >
          <div className="flex flex-wrap items-center gap-3">
            <p
              className={`text-sm font-black uppercase tracking-[0.2em] ${
                result.mode === "sent" ? "text-emerald-200" : "text-cyan-200"
              }`}
            >
              {result.mode === "sent"
                ? "SMTP live send"
                : "Preview generated (no SMTP)"}
            </p>
            <span className="rounded-full bg-slate-950/50 px-3 py-1 text-xs font-bold text-slate-100">
              Sent {result.sent_count} · Failed {result.failed_count} ·{" "}
              {result.recipients.length} recipients
            </span>
            {result.smtp_host ? (
              <span className="rounded-full bg-slate-950/50 px-3 py-1 text-xs font-bold text-slate-300">
                via {result.smtp_host}
              </span>
            ) : null}
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-slate-950/40 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                Room code
              </p>
              <p className="mt-1 font-mono text-lg font-black text-white">
                {result.room_code}
              </p>
              <button
                className="mt-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/10"
                onClick={() => void copy("room code", result.room_code)}
                type="button"
              >
                Copy room code
              </button>
            </div>
            <div className="rounded-xl bg-slate-950/40 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                Bingo join link
              </p>
              <p className="mt-1 break-all text-xs text-cyan-100">{result.bingo_join_url}</p>
              <button
                className="mt-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/10"
                onClick={() => void copy("Bingo join link", result.bingo_join_url)}
                type="button"
              >
                Copy join link
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-slate-950/40 p-3 text-sm">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
              Teams link
            </p>
            <p className="mt-1 break-all text-cyan-100">{result.teams_join_url}</p>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
              Recipients
            </p>
            <ul className="mt-2 space-y-2 text-sm text-slate-200">
              {result.recipients.map((r) => (
                <li
                  key={r.email}
                  className="rounded-xl bg-slate-950/50 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{r.email}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.16em] ${recipientStatusBadgeClass(r)}`}
                    >
                      {r.invite_status}
                    </span>
                    {r.sent_at ? (
                      <span className="text-[11px] font-semibold text-slate-500">
                        {new Date(r.sent_at).toLocaleTimeString()}
                      </span>
                    ) : null}
                  </div>
                  {r.invite_status === "FAILED" && r.error_message ? (
                    <p className="mt-1 text-xs text-rose-200/90">
                      {r.error_message}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                Email preview
              </p>
              <button
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/10"
                onClick={() => void copy("full invite", fullInviteText(result))}
                type="button"
              >
                Copy full invite text
              </button>
            </div>
            <p className="mt-2 text-xs font-bold text-slate-400">Subject</p>
            <p className="text-sm font-semibold text-white">{result.subject}</p>
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-slate-950/80 p-3 text-xs leading-relaxed text-slate-200">
              {result.body_preview}
            </pre>
          </div>

          <p className="text-xs text-slate-500">
            Game: <strong className="text-slate-300">{gameTitle}</strong>
            {gameTopic ? (
              <>
                {" "}
                · Topic: <strong className="text-slate-300">{gameTopic}</strong>
              </>
            ) : null}{" "}
            · Game ID <strong className="text-slate-300">{result.game_id}</strong>
          </p>
        </div>
      ) : null}
    </div>
  );
}
