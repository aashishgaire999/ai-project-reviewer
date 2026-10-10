"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { ReviewEvent, StepId, StepStatus } from "@/lib/events";
import type { Review } from "@/lib/review-types";
import { HeroArt, ReportIcon, RepoIcon, SiteIcon, Squiggle } from "./art";
import { Report } from "./report";

const EXAMPLES = ["sindresorhus/is", "vercel/swr", "aashishgaire999/ai-project-reviewer"];

const STEPS: { id: StepId; label: string; detail: string }[] = [
  { id: "repo", label: "Reading the repo", detail: "README, top-level files, languages, license" },
  { id: "site", label: "Visiting the live site", detail: "Page title, description and visible text" },
  { id: "review", label: "Writing the report", detail: "Usually 10 to 30 seconds" },
];

type Steps = Record<StepId, StepStatus | "waiting">;
const NO_STEPS: Steps = { repo: "waiting", site: "waiting", review: "waiting" };

function Field({ id, label, hint, ...props }: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        {hint && <span className="font-mono text-xs text-[var(--ink-2)]">{hint}</span>}
      </div>
      <input
        id={id}
        className="mt-1.5 w-full rounded-md border-[1.5px] border-[var(--line-strong)] bg-[var(--paper)] px-3.5 py-3 text-[15px] outline-none transition-colors placeholder:text-[var(--ink-2)]/60 focus:border-[var(--ink)]"
        {...props}
      />
    </div>
  );
}

function StepMark({ status }: { status: Steps[StepId] }) {
  const base = "grid h-7 w-7 shrink-0 place-items-center rounded-full border-[1.5px] text-sm font-semibold";
  if (status === "done") return <span className={`${base} border-[var(--pass)] text-[var(--pass)]`}>✓</span>;
  if (status === "failed") return <span className={`${base} border-[var(--stamp)] text-[var(--stamp)]`}>!</span>;
  if (status === "skipped") return <span className={`${base} border-[var(--line-strong)] text-[var(--ink-2)]`}>–</span>;
  if (status === "running") return <span className={`${base} border-[var(--ink)]`}><span className="pulse-dot h-2 w-2 rounded-full bg-[var(--ink)]" /></span>;
  return <span className={`${base} border-[var(--line-strong)]`} />;
}

function Progress({ steps }: { steps: Steps }) {
  return (
    <div className="rounded-lg border-[1.5px] border-[var(--ink)] bg-[var(--card)] p-5 sm:p-8" role="status" aria-live="polite">
      <div className="flex items-center gap-5">
        <svg viewBox="150 90 200 200" className="h-20 w-20 shrink-0" aria-hidden>
          <g className="art-scan fast">
            <circle cx="236" cy="168" r="54" fill="none" stroke="var(--ink)" strokeWidth="9" />
            <line x1="276" y1="208" x2="322" y2="254" stroke="var(--ink)" strokeWidth="18" strokeLinecap="round" />
          </g>
        </svg>
        <div>
          <p className="font-display text-2xl">Inspecting…</p>
          <p className="text-sm text-[var(--ink-2)]">Each step ticks off when the server actually finishes it.</p>
        </div>
      </div>
      <ol className="mt-6 space-y-4">
        {STEPS.map((step) => (
          <li key={step.id} className={`flex items-start gap-4 ${steps[step.id] === "waiting" ? "opacity-50" : ""}`}>
            <StepMark status={steps[step.id]} />
            <div>
              <p className="font-medium">
                {step.label}
                {steps[step.id] === "skipped" && <span className="text-[var(--ink-2)]"> (no live URL)</span>}
                {steps[step.id] === "failed" && step.id === "site" && <span className="text-[var(--stamp)]"> (couldn&apos;t load it, reviewing the repo only)</span>}
              </p>
              <p className="text-sm text-[var(--ink-2)]">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function Home() {
  const [githubUrl, setGithubUrl] = useState("");
  const [liveUrl, setLiveUrl] = useState("");
  const [description, setDescription] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Steps>(NO_STEPS);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ review: Review; repository: string } | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

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

  function reset() {
    setResult(null);
    setError("");
    setSteps(NO_STEPS);
    formRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  const showProgress = running && !result;

  return (
    <div className="min-h-screen overflow-x-hidden">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="font-display flex items-center gap-2 text-xl font-bold">
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
            <circle cx="10" cy="10" r="6.5" fill="none" stroke="var(--stamp)" strokeWidth="2.5" />
            <line x1="15" y1="15" x2="21" y2="21" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Project Reviewer
        </Link>
        <a href="https://github.com/aashishgaire999/ai-project-reviewer" className="font-mono text-sm text-[var(--ink-2)] hover:text-[var(--ink)]">
          Source ↗
        </a>
      </header>

      <main>
        <section className="relative">
          <div className="graph-paper pointer-events-none absolute inset-0" aria-hidden />
          <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 pb-10 pt-6 sm:px-6 md:grid-cols-[1.1fr_1fr] md:pb-16 md:pt-12">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-[var(--stamp)]">Free · open source · no sign-up</p>
              <h1 className="font-display mt-4 text-[42px] font-bold leading-[1.05] sm:text-6xl">
                A second pair of eyes for your{" "}
                <span className="relative inline-block">
                  repo.
                  <Squiggle className="absolute -bottom-2 left-0 h-3 w-full" />
                </span>
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-8 text-[var(--ink-2)]">
                Paste a public GitHub link. It reads what&apos;s actually there (the README, the files, the live site) and hands back
                a scored report with what&apos;s working and what to fix first.
              </p>
            </div>
            <HeroArt className="mx-auto w-full max-w-[300px] md:max-w-[420px]" />
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 sm:px-6" ref={formRef}>
          <div className="ticket rounded-lg border-[1.5px] border-[var(--ink)] bg-[var(--card)] shadow-[6px_6px_0_var(--ink)]">
            <div className="flex h-[87px] items-center justify-between border-b-[1.5px] border-dashed border-[var(--ink)] px-5 sm:px-8">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--ink-2)]">Inspection request</p>
                <p className="font-display text-2xl">What should we look at?</p>
              </div>
              <span className="font-mono hidden rounded-full border border-[var(--ink)] px-3 py-1 text-xs sm:inline">No. 001</span>
            </div>
            <form onSubmit={submit} className="space-y-5 p-5 sm:p-8">
              <div>
                <Field id="github" label="GitHub repository" type="url" required placeholder="https://github.com/owner/repo" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} />
                <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-[var(--ink-2)]">Try:</span>
                  {EXAMPLES.map((repo) => (
                    <button
                      key={repo}
                      type="button"
                      onClick={() => setGithubUrl(`https://github.com/${repo}`)}
                      className="font-mono rounded-full border border-[var(--line-strong)] px-2.5 py-0.5 text-xs hover:border-[var(--ink)]"
                    >
                      {repo}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="live" label="Live site" hint="optional" type="url" placeholder="https://your-project.com" value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)} />
                <Field id="description" label="What it does" hint="optional" maxLength={1000} placeholder="A habit tracker for…" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <details className="group rounded-md border border-dashed border-[var(--line-strong)] px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium marker:text-[var(--ink-2)]">Use your own Gemini key</summary>
                <div className="mt-3">
                  <Field id="key" label="Gemini API key" hint="sent once, never stored" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
                  <p className="mt-2 text-xs text-[var(--ink-2)]">
                    Only needed if the free reviews run out. Get one at{" "}
                    <a className="underline underline-offset-2" href="https://aistudio.google.com/apikey">aistudio.google.com</a>.
                  </p>
                </div>
              </details>
              <button
                type="submit"
                disabled={running}
                className="w-full rounded-full bg-[var(--ink)] px-6 py-3.5 font-semibold text-[var(--paper)] transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60 sm:w-auto"
              >
                {running ? "Inspecting…" : "Inspect my repo →"}
              </button>
            </form>
          </div>
        </section>

        <section ref={outputRef} className="mx-auto max-w-3xl scroll-mt-6 space-y-6 px-4 pt-10 sm:px-6">
          {showProgress && <Progress steps={steps} />}
          {error && (
            <div role="alert" className="flex gap-4 rounded-lg border-[1.5px] border-[var(--stamp)] bg-[var(--card)] p-5">
              <span className="font-display text-3xl leading-none text-[var(--stamp)]">!</span>
              <div>
                <p className="font-medium">That didn&apos;t work.</p>
                <p className="mt-1 text-[var(--ink-2)]">{error}</p>
              </div>
            </div>
          )}
          {result && <Report review={result.review} repository={result.repository} onReset={reset} />}
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">How it works</h2>
          <div className="mt-10 grid gap-10 md:grid-cols-3">
            {[
              { icon: <RepoIcon />, title: "Reads the repo", text: "Pulls the README, top-level files, languages and license straight from GitHub, so it judges the code, not the pitch." },
              { icon: <SiteIcon />, title: "Visits the site", text: "If you give a live link, it loads the page and reads what visitors actually see." },
              { icon: <ReportIcon />, title: "Writes the report", text: "Gemini scores four areas and lists strengths, fixes and next steps, each tied to something it found." },
            ].map((step, i) => (
              <div key={step.title} className="relative">
                <span className="font-mono absolute -top-6 left-0 text-xs text-[var(--ink-2)]">0{i + 1}</span>
                {step.icon}
                <h3 className="font-display mt-4 text-xl font-bold">{step.title}</h3>
                <p className="mt-2 leading-7 text-[var(--ink-2)]">{step.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t-[1.5px] border-[var(--ink)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            Built with{" "}
            <a href="https://codyza.com" className="font-display text-base font-bold underline decoration-[var(--stamp)] decoration-2 underline-offset-4">
              Codyza
            </a>
          </p>
          <p className="text-[var(--ink-2)]">
            Open source on{" "}
            <a href="https://github.com/aashishgaire999/ai-project-reviewer" className="underline underline-offset-4 hover:text-[var(--ink)]">GitHub</a>
            {" "}· Reviews can be wrong, so treat them as a second opinion.
          </p>
        </div>
      </footer>
    </div>
  );
}
