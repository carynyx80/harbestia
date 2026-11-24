"use client";

import { useEffect, useState } from "react";
import { castVote, errorMessage } from "@/lib/data";
import { motion, AnimatePresence } from "framer-motion";
import { ThumbsUp, ThumbsDown, Lock, FileText, ExternalLink, Loader2, ShieldCheck, Cpu } from "lucide-react";
import { Card, SectionTitle } from "./primitives";

type Props = {
  campaignId: string;
  campaignName: string;
  milestoneTitle: string;
  milestoneIndex: number;
  description: string;
  releaseLabel: string;
  closesAt: string;
  opensAt: string;
  quorumPct: number;
  quorumRequiredPct: number;
  evidence: { label: string; href: string }[];
  sample?: boolean;
};

function useCountdown(target: string) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, new Date(target).getTime() - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [target]);
  return left;
}

export default function VoteClient(p: Props) {
  const left = useCountdown(p.closesAt);
  const [choice, setChoice] = useState<"yes" | "no" | null>(null);
  const [phase, setPhase] = useState<"idle" | "encrypting" | "cast">("idle");

  const total = new Date(p.closesAt).getTime() - new Date(p.opensAt).getTime();
  const elapsedPct = left === null ? 0 : ((total - left) / total) * 100;
  const parts =
    left === null
      ? ["--", "--", "--", "--"]
      : [
          Math.floor(left / 86400000),
          Math.floor((left % 86400000) / 3600000),
          Math.floor((left % 3600000) / 60000),
          Math.floor((left % 60000) / 1000),
        ].map((n) => String(n).padStart(2, "0"));

  const [error, setError] = useState<string | null>(null);
  const cast = async () => {
    if (!choice || p.sample) return;
    setError(null);
    setPhase("encrypting");
    try {
      await castVote(p.campaignId, p.milestoneIndex, choice);
      setPhase("cast");
    } catch (e) {
      setError(errorMessage(e));
      setPhase("idle");
    }
  };

  const quorum = phase === "cast" ? p.quorumPct + 1 : p.quorumPct;
  const reqPos = (p.quorumRequiredPct / 40) * 100;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-6">
        <Card className="p-6">
          <SectionTitle kicker={`Milestone ${p.milestoneIndex} · ${p.releaseLabel} release`}>{p.milestoneTitle}</SectionTitle>
          <p className="-mt-2 text-sm text-muted">{p.description}</p>
          <div className="mt-6 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Evidence submitted by founder</div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {p.evidence.map((e) => {
              // Sample campaigns have placeholder evidence: show it as a label, not a dead link.
              const real = !!e.href && e.href !== "#" && /^https?:\/\//.test(e.href) && !e.href.includes("bafysample");
              const inner = (
                <>
                  <span className="grid h-9 w-9 shrink-0 place-items-center bg-ink/[0.05] text-muted group-hover:text-signal-ink">
                    <FileText className="h-4 w-4" />
                  </span>
                  <span className="flex-1">{e.label}</span>
                  {real ? (
                    <ExternalLink className="h-3.5 w-3.5 text-muted group-hover:text-ink" />
                  ) : (
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">Sample</span>
                  )}
                </>
              );
              return (
                <li key={e.label}>
                  {real ? (
                    <a
                      href={e.href}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-center gap-3 border border-ink bg-paper p-3.5 text-sm text-ink transition hover:border-ink hover:bg-ink/[0.04]"
                    >
                      {inner}
                    </a>
                  ) : (
                    <div className="flex items-center gap-3 border border-ink/40 bg-paper p-3.5 text-sm text-ink">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <SectionTitle kicker="Your vote">Should funds be released?</SectionTitle>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["yes", "no"] as const).map((c) => {
              const active = choice === c;
              const yes = c === "yes";
              return (
                <motion.button
                  key={c}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={p.sample || phase !== "idle"}
                  onClick={() => setChoice(c)}
                  className={`relative flex h-40 flex-col items-center justify-center gap-3  border text-2xl font-semibold transition ${
                    active
                      ? yes
                        ? "border-ink bg-signal/15 text-signal-ink "
                        : "border-[#B3261E] bg-[#B3261E]/10 text-[#B3261E] "
                      : "border-ink/25 bg-paper text-ink hover:border-ink/25 hover:text-signal-ink"
                  }`}
                >
                  {yes ? <ThumbsUp className="h-8 w-8" /> : <ThumbsDown className="h-8 w-8" />}
                  {yes ? "Yes, release" : "No, reject"}
                  <span className="text-xs font-normal text-muted">
                    {yes ? `Unlock ${p.releaseLabel} to founder` : "Founder gets one 30-day resubmission"}
                  </span>
                </motion.button>
              );
            })}
          </div>
          <div className="mt-4 flex items-start gap-2.5 border border-ink bg-white p-3.5 text-xs leading-relaxed text-muted">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal-ink" />
            Votes are currently recorded by the Harvestia API and tallied when voting closes. Encrypted voting (Arcium MPC) is in development.
          </div>
          <button
            onClick={cast}
            disabled={p.sample || !choice || phase !== "idle"}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 bg-ink py-3 text-sm font-semibold text-paper transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={phase} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="inline-flex items-center gap-2">
                {phase === "idle" && (p.sample ? <>Sample campaign — voting disabled</> : <><ShieldCheck className="h-4 w-4" /> Cast vote</>)}
                {phase === "encrypting" && <><Loader2 className="h-4 w-4 animate-spin" /> Submitting vote…</>}
                {phase === "cast" && <><ShieldCheck className="h-4 w-4" /> Vote recorded — thank you</>}
              </motion.span>
            </AnimatePresence>
          </button>
          {error && <p role="alert" className="mt-2 bg-[#B3261E]/10 px-3 py-2 text-xs text-[#B3261E]">{error}</p>}
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="p-5">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Voting closes in</div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {parts.map((v, i) => (
              <div key={i} className="border border-ink bg-white py-3 text-center">
                <div className="text-2xl font-semibold tabular-nums text-ink">{v}</div>
                <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{["days", "hrs", "min", "sec"][i]}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 h-1 overflow-hidden bg-ink/[0.06]">
            <div className="h-full bg-navy" style={{ width: `${elapsedPct}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-muted">
            <span>Opened</span>
            <span>7-day window</span>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Quorum</div>
            <span className="text-[11px] text-muted">Need {p.quorumRequiredPct}% of stake</span>
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <motion.span key={quorum} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="display text-4xl font-black tabular text-ink">
              {quorum}%
            </motion.span>
            <span className="text-sm text-muted">participated</span>
          </div>
          <div className="relative mt-4 h-2.5 bg-ink/[0.06]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(quorum / 40) * 100}%` }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
              className="h-full bg-signal "
            />
            <div className="absolute -top-1 h-4.5 w-0.5 bg-navy" style={{ left: `${reqPos}%` }} />
          </div>
          <p className="mt-3 text-xs text-muted">
            Only participation % is shown until close. Max 10% weight per voter.
          </p>
        </Card>

        <Card className="flex items-start gap-3 p-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center bg-signal/15 text-signal-ink">
            <Cpu className="h-4 w-4" />
          </span>
          <div className="text-xs leading-relaxed text-muted">
            <div className="mb-0.5 text-sm font-medium text-ink">{p.campaignName} · private tally coming</div>
            Planned: one vote per position via ZK nullifier and weights tallied in Arcium MPC. Not live yet — today weight is your verified stake.
          </div>
        </Card>
      </div>
    </div>
  );
}
