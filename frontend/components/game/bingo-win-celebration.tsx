"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { sendPrizeEmail } from "@/lib/api/prize";

const CONFETTI_COLORS = ["#F5C518", "#ffffff", "#a855f7", "#22d3ee"] as const;
const AUTO_DISMISS_MS = 10_000;
/** Extended timeout when the prize email section is available. */
const AUTO_DISMISS_WITH_EMAIL_MS = 60_000;

type ConfettiPiece = Readonly<{
  id: number;
  leftPercent: number;
  sizePx: number;
  color: string;
  durationSec: number;
  delaySec: number;
}>;

function buildConfettiPieces(): ConfettiPiece[] {
  return Array.from({ length: 80 }, (_, id) => ({
    id,
    leftPercent: (id * 17 + 7) % 100,
    sizePx: 8 + ((id * 3) % 9),
    color: CONFETTI_COLORS[id % CONFETTI_COLORS.length] ?? "#F5C518",
    durationSec: 2 + ((id * 5) % 30) / 10,
    delaySec: (id % 20) / 10,
  }));
}

type MarqueeBulb = Readonly<{
  id: number;
  style: CSSProperties;
  variant: "yellow" | "white";
}>;

function buildMarqueeBulbs(): MarqueeBulb[] {
  const bulbs: MarqueeBulb[] = [];
  const perEdge = 18;
  let id = 0;

  for (let i = 0; i < perEdge; i += 1) {
    const along = `${((i + 0.5) / perEdge) * 100}%`;
    const variant = i % 2 === 0 ? "yellow" : "white";
    bulbs.push({
      id: id++,
      variant,
      style: { top: 10, left: along, transform: "translate(-50%, -50%)" },
    });
    bulbs.push({
      id: id++,
      variant: i % 2 === 0 ? "white" : "yellow",
      style: { bottom: 10, left: along, transform: "translate(-50%, 50%)" },
    });
    bulbs.push({
      id: id++,
      variant,
      style: { left: 10, top: along, transform: "translate(-50%, -50%)" },
    });
    bulbs.push({
      id: id++,
      variant: i % 2 === 0 ? "white" : "yellow",
      style: { right: 10, top: along, transform: "translate(50%, -50%)" },
    });
  }

  return bulbs;
}

const MARQUEE_BULBS = buildMarqueeBulbs();
const CONFETTI_PIECES = buildConfettiPieces();

const CELEBRATION_STYLES = `
@keyframes bingo-marquee-yellow {
  0%, 49.99% {
    background-color: #F5C518;
    box-shadow: 0 0 10px #F5C518, 0 0 18px rgba(245, 197, 24, 0.6);
  }
  50%, 100% {
    background-color: #2a2a2a;
    box-shadow: none;
  }
}
@keyframes bingo-marquee-white {
  0%, 49.99% {
    background-color: #ffffff;
    box-shadow: 0 0 10px #ffffff, 0 0 16px rgba(255, 255, 255, 0.5);
  }
  50%, 100% {
    background-color: #2a2a2a;
    box-shadow: none;
  }
}
@keyframes bingo-title-pop {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  70% {
    transform: scale(1.2);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
@keyframes bingo-confetti-fall {
  0% {
    transform: translateY(-12vh) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(110vh) rotate(720deg);
    opacity: 0.85;
  }
}
.bingo-marquee-bulb-yellow {
  animation: bingo-marquee-yellow 0.4s steps(1, end) infinite;
}
.bingo-marquee-bulb-white {
  animation: bingo-marquee-white 0.4s steps(1, end) infinite;
  animation-delay: 0.2s;
}
.bingo-title-pop {
  animation: bingo-title-pop 0.5s ease-out forwards;
}
.bingo-confetti-piece {
  animation-name: bingo-confetti-fall;
  animation-timing-function: linear;
  animation-iteration-count: 1;
  animation-fill-mode: forwards;
}
`;

type EmailStatus = "idle" | "sending" | "sent" | "error";

type BingoWinCelebrationProps = Readonly<{
  open: boolean;
  playerName: string;
  onDismiss: () => void;
  /** Game ID used to call the prize-send endpoint. Required for email capture. */
  gameId?: string;
  /** Winner's rank (1-based). Required for prize email body. */
  placement?: number | null;
}>;

export function BingoWinCelebration({
  open,
  playerName,
  onDismiss,
  gameId = "",
  placement = null,
}: BingoWinCelebrationProps) {
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Email capture state — reset each time the celebration opens.
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [emailDismissed, setEmailDismissed] = useState(false);

  // Auto-dismiss: extend the timeout when email capture is available so the
  // player has enough time to type and submit before the overlay disappears.
  const showEmailSection =
    Boolean(gameId.trim()) && placement != null && !emailDismissed;
  const dismissDelay = showEmailSection
    ? AUTO_DISMISS_WITH_EMAIL_MS
    : AUTO_DISMISS_MS;

  useEffect(() => {
    if (!open) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      onDismiss();
    }, dismissDelay);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [open, onDismiss, dismissDelay]);

  const displayName = useMemo(
    () => playerName.trim() || "You",
    [playerName],
  );

  async function handleSendEmail() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !gameId.trim() || placement == null) return;

    setEmailStatus("sending");
    try {
      const result = await sendPrizeEmail(gameId.trim(), {
        player_name: displayName,
        player_email: trimmedEmail,
        placement,
      });
      if (result.success) {
        setEmailStatus("sent");
        // Show the success message for 3 seconds then hide the section.
        setTimeout(() => setEmailDismissed(true), 3000);
      } else {
        setEmailStatus("error");
      }
    } catch {
      setEmailStatus("error");
    }
  }

  if (!open || !isClient) {
    return null;
  }

  return createPortal(
    <>
      <style>{CELEBRATION_STYLES}</style>
      <div
        aria-labelledby="bingo-celebration-title"
        aria-modal="true"
        className="fixed inset-0 z-[250] flex flex-col items-center justify-center overflow-hidden"
        role="dialog"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[rgba(0,0,0,0.85)]"
        />

        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          {CONFETTI_PIECES.map((piece) => (
            <span
              className="bingo-confetti-piece absolute top-0 rounded-sm"
              key={piece.id}
              style={{
                left: `${piece.leftPercent}%`,
                width: piece.sizePx,
                height: piece.sizePx * 0.65,
                backgroundColor: piece.color,
                animationDuration: `${piece.durationSec}s`,
                animationDelay: `${piece.delaySec}s`,
              }}
            />
          ))}
        </div>

        <div aria-hidden className="pointer-events-none absolute inset-0">
          {MARQUEE_BULBS.map((bulb) => (
            <span
              className={`absolute size-3 rounded-full ${
                bulb.variant === "yellow"
                  ? "bingo-marquee-bulb-yellow"
                  : "bingo-marquee-bulb-white"
              }`}
              key={bulb.id}
              style={bulb.style}
            />
          ))}
        </div>

        <div className="relative z-10 flex max-w-sm flex-col items-center px-6 text-center">
          <h2
            className="bingo-title-pop font-black uppercase leading-none text-white"
            id="bingo-celebration-title"
            style={{
              fontSize: "clamp(80px, 15vw, 180px)",
              textShadow: "0 0 40px #F5C518, 0 0 80px #F5C518",
            }}
          >
            BINGO!
          </h2>
          <p className="mt-6 text-2xl font-bold text-white sm:text-3xl">
            🏆 You got Bingo!
          </p>
          <p className="mt-3 text-xl font-black text-[#F5C518] sm:text-2xl">
            {displayName}
          </p>

          {/* ── Prize email capture ── */}
          {showEmailSection ? (
            <div className="mt-8 w-full">
              {emailStatus === "sent" ? (
                <p className="text-lg font-black text-yellow-300">
                  🎉 Prize email sent! Check your inbox.
                </p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-white/90">
                    Enter your email to receive your prize
                  </p>
                  <input
                    className="mt-3 w-full rounded-2xl border border-white/20 bg-slate-900/80 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-yellow-300/70"
                    disabled={emailStatus === "sending"}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    type="email"
                    value={email}
                  />
                  <p className="mt-1.5 text-xs text-slate-400">
                    We&apos;ll send your gift card here
                  </p>
                  <button
                    className="mt-3 w-full rounded-full bg-yellow-300 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-slate-950 shadow-lg shadow-yellow-500/30 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={emailStatus === "sending" || !email.trim()}
                    onClick={() => void handleSendEmail()}
                    type="button"
                  >
                    {emailStatus === "sending" ? "Sending…" : "Send my prize"}
                  </button>
                  {emailStatus === "error" ? (
                    <p className="mt-2 text-sm font-semibold text-red-300">
                      Could not send — try again
                    </p>
                  ) : null}
                  <button
                    className="mt-3 block w-full text-sm text-slate-400/70 transition hover:text-slate-300"
                    onClick={() => setEmailDismissed(true)}
                    type="button"
                  >
                    No thanks
                  </button>
                </>
              )}
            </div>
          ) : null}
          {/* ── End email capture ── */}

          <button
            className="mt-8 rounded-full border border-white/20 bg-white/10 px-8 py-3.5 text-sm font-black uppercase tracking-[0.18em] text-white transition hover:border-white/35 hover:bg-white/20"
            onClick={onDismiss}
            type="button"
          >
            Continue watching
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
