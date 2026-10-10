"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRef, useState } from "react";
import type { ReviewEvent, StepId, StepStatus } from "@/lib/events";
import type { Review } from "@/lib/review-types";
import { HeroWindow } from "./hero";
import { Report } from "./report";
import { CardStack } from "./stack";
import { Reveal, Rings } from "./rings";

const EXAMPLES = ["sindresorhus/is", "vercel/swr", "aashishgaire999/ai-project-reviewer"];
const EASE = [0.22, 1, 0.36, 1] as const;

const STEPS: { id: StepId; label: string }[] = [
  { id: "repo", label: "Reading the repo" },
  { id: "site", label: "Visiting the site" },
  { id: "review", label: "Writing the review" },
];

type Steps = Record<StepId, StepStatus | "waiting">;
const NO_STEPS: Steps = { repo: "waiting", site: "waiting", review: "waiting" };

function Headline() {
  const reduce = useReducedMotion();
  const lines = [["Your", "code,"], ["honestly", "reviewed."]];
  let n = 0;
  return (
    <h1 className="text-[44px] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-7xl md:text-[88px]">
      {lines.map((words, li) => (
        <span key={li} className="block">
          {words.map((word) => {
            const i = n++;
            return (
              <motion.span
                key={word}
                className={`mr-[0.22em] inline-block ${li === 1 ? "accent-gradient" : "headline-gradient"}`}
                initial={reduce ? false : { opacity: 0, y: 40, filter: "blur(10px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.9, delay: 0.08 * i, ease: EASE }}
              >
                {word}
              </motion.span>
            );
          })}
        </span>
      ))}
    </h1>
  );
}

function StepDot({ status }: { status: Steps[StepId] }) {
  if (status === "done")
    return (
      <motion.span initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 20 }} className="grid h-8 w-8 place-items-center rounded-full bg-[var(--accent)] text-sm font-bold text-[var(--bg)]">
        ✓
      </motion.span>
    );
  if (status === "running")
    return (
      <span className="relative grid h-8 w-8 place-items-center">
        <motion.span className="absolute inset-0 rounded-full border-2 border-[var(--accent)] border-t-transparent" animate={{ rotate: 360 }} transition={{ duration: 0.9, ease: "linear", repeat: Infinity }} />
      </span>
    );
  if (status === "failed") return <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-[var(--text-2)] text-sm font-bold text-[var(--text-2)]">!</span>;
  if (status === "skipped") return <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--surface-2)] text-sm text-[var(--text-2)]">–</span>;
  return <span className="h-8 w-8 rounded-full border-2 border-[var(--hairline)]" />;
}

function Progress({ steps }: { steps: Steps }) {
  const done = Object.values(steps).filter((s) => s === "done" || s === "skipped" || s === "failed").length;
  return (
    <motion.div className="card p-6 sm:p-10" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.5, ease: EASE }} role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-8 sm:flex-row">
        <Rings values={[10, 7, 4]} size={110} stroke={11} gap={4} loop />
        <div className="w-full">
          <p className="text-2xl font-semibold tracking-tight">Reviewing your project…</p>
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <motion.div className="h-full rounded-full bg-[var(--accent)]" animate={{ width: `${(done / 3) * 100}%` }} transition={{ duration: 0.6, ease: EASE }} />
          </div>
        </div>
      </div>
      <ol className="mt-8 grid gap-4 sm:grid-cols-3">
        {STEPS.map((step) => (
          <li key={step.id} className={`flex items-center gap-3 rounded-2xl bg-[var(--surface-2)] p-4 transition-opacity ${steps[step.id] === "waiting" ? "opacity-50" : ""}`}>
            <StepDot status={steps[step.id]} />
            <div>
              <p className="text-sm font-medium">{step.label}</p>
              {steps[step.id] === "skipped" && <p className="text-xs text-[var(--text-2)]">No live URL</p>}
              {steps[step.id] === "failed" && step.id === "site" && <p className="text-xs text-[var(--text-2)]">Couldn&apos;t load, skipping</p>}
            </div>
          </li>
        ))}
      </ol>
    </motion.div>
  );
}

function ScanTile() {
  const reduce = useReducedMotion();
  return (
    <div className="relative h-40 overflow-hidden rounded-2xl bg-[var(--surface-2)] p-5">
      {[80, 62, 90, 45, 70, 55].map((w, i) => (
        <div key={i} className="mb-3 h-2 rounded-full bg-[var(--text-2)] opacity-25" style={{ width: `${w}%` }} />
      ))}
      {!reduce && (
        <motion.div
          className="absolute inset-x-0 h-10"
          style={{ background: "linear-gradient(180deg, transparent, color-mix(in srgb, var(--accent) 30%, transparent), transparent)" }}
          animate={{ top: ["-20%", "100%"] }}
          transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.4 }}
        />
      )}
    </div>
  );
}

function BrowserTile() {
  const reduce = useReducedMotion();
  return (
    <div className="h-40 overflow-hidden rounded-2xl bg-[var(--surface-2)]">
      <div className="flex items-center gap-1.5 border-b border-[var(--hairline)] px-3 py-2">
        {[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 rounded-full bg-[var(--text-2)] opacity-30" />)}
        <div className="ml-2 h-2 flex-1 overflow-hidden rounded-full bg-[var(--hairline)]">
          <motion.div className="h-full bg-[var(--accent)]" animate={reduce ? undefined : { width: ["0%", "100%"] }} transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 0.8, ease: "easeOut" }} style={{ width: reduce ? "100%" : undefined }} />
        </div>
      </div>
      <div className="space-y-2.5 p-4">
        <div className="h-4 w-1/2 rounded-md bg-[var(--text-2)] opacity-30" />
        <div className="h-2 w-5/6 rounded-full bg-[var(--text-2)] opacity-20" />
        <div className="h-2 w-2/3 rounded-full bg-[var(--text-2)] opacity-20" />
        <div className="mt-3 h-7 w-24 rounded-full bg-[var(--accent)] opacity-80" />
      </div>
    </div>
  );
}

function RingsTile() {
  return (
    <div className="grid h-40 place-items-center rounded-2xl bg-[var(--surface-2)]">
      <Rings values={[8, 6, 7, 9]} size={136} stroke={9} gap={3} loop>
        <span className="text-xl font-semibold">8</span>
      </Rings>
    </div>
  );
}

export default function Home() {
  const [githubUrl, setGithubUrl] = useState("");
  const [liveUrl, setLiveUrl] = useState("");
  const [description, setDescription] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [more, setMore] = useState(false);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Steps>(NO_STEPS);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ review: Review; repository: string } | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handle(event: ReviewEvent) {
    if (event.type === "step") setSteps((s) => ({ ...s, [event.step]: event.status }));
    else if (event.type === "result") setResult({ review: event.review, repository: event.repository });
    else setError(event.error);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    setError("");
    setResult(null);
    setSteps(NO_STEPS);
    requestAnimationFrame(() => outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubUrl, liveUrl, description, apiKey }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Something went wrong. Try again.");
      } else {
        // One JSON event per line; a chunk can end mid-line, so keep the remainder.
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) if (line.trim()) handle(JSON.parse(line));
        }
        if (buffer.trim()) handle(JSON.parse(buffer));
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setRunning(false);
  }

  function startOver() {
    setResult(null);
    setError("");
    setSteps(NO_STEPS);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => inputRef.current?.focus(), 500);
  }

  return (
    <div className="min-h-screen overflow-x-clip">
      <main>
        <section className="mx-auto max-w-6xl px-4 pt-20 text-center sm:px-6 sm:pt-28">
          <motion.p className="flex items-center justify-center gap-2 text-lg font-semibold text-[var(--accent)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
              <circle cx="12" cy="12" r="9" fill="none" stroke="var(--ring-1)" strokeWidth="3" strokeDasharray="44 100" strokeLinecap="round" transform="rotate(-90 12 12)" />
              <circle cx="12" cy="12" r="4.5" fill="none" stroke="var(--ring-3)" strokeWidth="3" strokeDasharray="20 100" strokeLinecap="round" transform="rotate(-90 12 12)" />
            </svg>
            Project Reviewer
          </motion.p>
          <div className="mt-3"><Headline /></div>
          <motion.p
            className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[var(--text-2)] sm:text-xl"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.35, ease: EASE }}
          >
            Paste a repo. Get a score.
          </motion.p>
        </section>

        <section ref={formRef} className="mx-auto mt-10 max-w-2xl scroll-mt-24 px-4 sm:px-6">
          <motion.form onSubmit={submit} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.5, ease: EASE }}>
            <label htmlFor="github" className="sr-only">GitHub repository URL</label>
            <div className="card flex items-center gap-2 !rounded-full p-1.5 pl-5 transition-shadow focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_25%,transparent)]">
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-[var(--text-2)]" aria-hidden>
                <path fill="currentColor" d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
              </svg>
              <input
                ref={inputRef}
                id="github"
                type="url"
                required
                placeholder="https://github.com/owner/repo"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                className="min-w-0 flex-1 bg-transparent py-3 text-[17px] outline-none placeholder:text-[var(--text-2)]"
              />
              <motion.button
                type="submit"
                disabled={running}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.95 }}
                className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-[var(--accent)] px-5 font-medium text-white disabled:opacity-60"
              >
                {running ? "Reviewing…" : <>Review<span aria-hidden>→</span></>}
              </motion.button>
            </div>

            <label htmlFor="live" className="sr-only">Live site URL (optional)</label>
            <div className="mx-auto mt-3 flex max-w-xl items-center gap-3 rounded-full bg-[var(--surface-2)] px-5 transition-shadow focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_25%,transparent)]">
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[var(--text-2)]" aria-hidden>
                <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="M2.5 12h19M12 2.5c2.6 2.6 3.9 5.8 3.9 9.5s-1.3 6.9-3.9 9.5c-2.6-2.6-3.9-5.8-3.9-9.5s1.3-6.9 3.9-9.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
              </svg>
              <input
                id="live"
                type="url"
                placeholder="Live site (optional)"
                value={liveUrl}
                onChange={(e) => setLiveUrl(e.target.value)}
                className="min-w-0 flex-1 bg-transparent py-3 text-[15px] outline-none placeholder:text-[var(--text-2)]"
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
              <span className="text-[var(--text-2)]">Try</span>
              {EXAMPLES.map((repo) => (
                <motion.button
                  key={repo}
                  type="button"
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setGithubUrl(`https://github.com/${repo}`)}
                  className="font-mono rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs hover:text-[var(--accent)]"
                >
                  {repo}
                </motion.button>
              ))}
              <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} className="ml-1 text-[var(--accent)] hover:underline">
                {more ? "Fewer options" : "More options"}
              </button>
            </div>

            <AnimatePresence initial={false}>
              {more && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.45, ease: EASE }} className="overflow-hidden">
                  <div className="card mt-4 grid gap-4 p-5 text-left">
                    {[
                      { id: "description", label: "What it does", type: "text", placeholder: "A habit tracker for…", value: description, set: setDescription },
                    ].map((f) => (
                      <div key={f.id}>
                        <label htmlFor={f.id} className="text-sm font-medium">{f.label}</label>
                        <input id={f.id} type={f.type} placeholder={f.placeholder} value={f.value} maxLength={1000} onChange={(e) => f.set(e.target.value)} className="mt-1.5 w-full rounded-xl bg-[var(--surface-2)] px-3.5 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                      </div>
                    ))}
                    <div>
                      <label htmlFor="key" className="text-sm font-medium">Your Gemini API key</label>
                      <input id="key" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="mt-1.5 w-full rounded-xl bg-[var(--surface-2)] px-3.5 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                      <p className="mt-1.5 text-xs text-[var(--text-2)]">
                        Optional. Sent once, never stored.{" "}
                        <a className="text-[var(--accent)] hover:underline" href="https://aistudio.google.com/apikey">aistudio.google.com</a>.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.form>
        </section>

        <section ref={outputRef} className="mx-auto max-w-5xl scroll-mt-20 px-4 sm:px-6">
          <AnimatePresence mode="wait">
            {running && !result && !error && <div key="p" className="pt-12"><Progress steps={steps} /></div>}
          </AnimatePresence>
          <AnimatePresence>
            {error && (
              <motion.div key="e" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="card mt-12 flex items-start gap-4 p-6">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-[var(--text-2)] font-bold text-[var(--text-2)]">!</span>
                <div>
                  <p className="font-semibold">That didn&apos;t work.</p>
                  <p className="mt-1 text-[var(--text-2)]">{error}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {result && <div className="pt-12"><Report review={result.review} repository={result.repository} onReset={startOver} /></div>}
        </section>

        <section className="px-4 pt-20 sm:px-6 sm:pt-28">
          <HeroWindow />
        </section>

        <section className="overflow-x-clip px-4 pt-16 sm:px-6">
          <CardStack />
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-24 sm:px-6 sm:py-32">
          <Reveal>
            <h2 className="text-center text-4xl font-semibold tracking-[-0.03em] sm:text-6xl">
              <span className="headline-gradient">Read.</span> <span className="headline-gradient">Visit.</span> <span className="accent-gradient">Score.</span>
            </h2>
          </Reveal>
          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {[
              { tile: <ScanTile />, title: "Your repo" },
              { tile: <BrowserTile />, title: "Your site" },
              { tile: <RingsTile />, title: "Your score" },
            ].map((s, i) => (
              <Reveal key={s.title} delay={i * 0.12}>
                <div className="card h-full p-5">
                  {s.tile}
                  <h3 className="mt-4 text-center text-lg font-semibold tracking-tight">{s.title}</h3>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--hairline)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-[var(--text-2)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            Built with{" "}
            <a href="https://codyza.com" className="font-semibold text-[var(--text)] hover:text-[var(--accent)]">Codyza</a>
          </p>
          <p>
            <a href="https://github.com/aashishgaire999/ai-project-reviewer" className="hover:text-[var(--text)] hover:underline">GitHub</a>
            {" "}· A second opinion, not a verdict.
          </p>
        </div>
      </footer>
    </div>
  );
}
