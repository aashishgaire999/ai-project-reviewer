"use client";

import { useState } from "react";
import type { Category, Review } from "@/lib/review";

const LABELS: Record<Category, string> = {
  code_quality: "Code quality",
  originality: "Originality",
  completeness: "Completeness",
  documentation: "Documentation",
};

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent)]">{children}</p>;
}

function Field({ id, label, hint, ...props }: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      {hint && <p className="mt-0.5 text-xs text-[var(--muted)]">{hint}</p>}
      <input
        id={id}
        className="mt-1.5 w-full border border-[var(--rule)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
        {...props}
      />
    </div>
  );
}

function List({ title, items, marker }: { title: string; items: string[]; marker: string }) {
  if (!items.length) return null;
  return (
    <section className="border-t border-[var(--rule)] pt-5">
      <Label>{title}</Label>
      <ul className="mt-3 space-y-2 text-sm leading-6">
        {items.map((item) => (
          <li key={item} className="flex gap-3">
            <span className="text-[var(--accent)]" aria-hidden>{marker}</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Result({ review, repository }: { review: Review; repository: string }) {
  return (
    <article className="mt-12 space-y-8" aria-live="polite">
      <div className="flex flex-wrap items-end justify-between gap-6 border-t border-[var(--rule)] pt-6">
        <div className="max-w-xl">
          <Label>Review / {repository}</Label>
          <p className="mt-3 text-base leading-7">{review.summary}</p>
          {review.one_liner && <p className="mt-3 text-sm italic text-[var(--muted)]">{review.one_liner}</p>}
        </div>
        <p className="text-7xl font-bold leading-none text-[var(--accent)]">
          {review.score}
          <span className="text-2xl text-[var(--muted)]">/10</span>
        </p>
      </div>

      <section className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
        {(Object.keys(LABELS) as Category[]).map((key) => (
          <div key={key}>
            <p className="text-xs uppercase tracking-widest text-[var(--muted)]">{LABELS[key]}</p>
            <div className="mt-2 h-1.5 bg-[var(--rule)]">
              <div className="h-full bg-[var(--accent)]" style={{ width: `${review.breakdown[key] * 10}%` }} />
            </div>
            <p className="mt-1 text-sm">{review.breakdown[key]}/10</p>
          </div>
        ))}
      </section>

      <List title="Strengths" items={review.strengths} marker="+" />
      <List title="Improve" items={review.improvements} marker="−" />
      <List title="Next steps" items={review.roadmap} marker="→" />
      <List title="Study" items={review.references} marker="›" />

      <p className="border-t border-[var(--rule)] pt-5 text-xs text-[var(--muted)]">
        Grounded in: {review.grounded.repository ? "repository metadata and README" : "no repository content"}
        {review.grounded.liveSite ? ", live site text" : ""}. AI reviews can be wrong. Treat this as a second opinion.
      </p>
    </article>
  );
}

export default function Home() {
  const [githubUrl, setGithubUrl] = useState("");
  const [liveUrl, setLiveUrl] = useState("");
  const [description, setDescription] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ review: Review; repository: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubUrl, liveUrl, description, apiKey }),
      });
      const data = await res.json().catch(() => ({ error: "The server sent an unreadable response." }));
      if (!res.ok) setError(data.error || "Something went wrong.");
      else setResult(data);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setLoading(false);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <div className="flex items-center justify-between border-b border-[var(--rule)] pb-3">
        <Label>AI / Project reviewer</Label>
        <a href="https://github.com/aashishgaire999/ai-project-reviewer" className="text-xs text-[var(--muted)] hover:text-[var(--fg)]">
          Source
        </a>
      </div>
      <h1 className="mt-8 text-4xl font-bold tracking-tight sm:text-5xl">Get your repo reviewed.</h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-[var(--muted)]">
        Paste a public GitHub repo. The reviewer reads its README, files and languages, and your live site if you have
        one, then scores it on what&apos;s actually there, not on what the description claims.
      </p>

      <form onSubmit={submit} className="mt-10 space-y-5">
        <Field id="github" label="GitHub repository" type="url" required placeholder="https://github.com/owner/repo" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} />
        <Field id="live" label="Live URL" hint="Optional." type="url" placeholder="https://your-project.com" value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)} />
        <Field id="description" label="What it does" hint="Optional. One or two sentences." maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
        <Field
          id="key"
          label="Your Gemini API key"
          hint="Optional if this server has its own key. Used for this request only and never stored."
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto dark:text-black"
        >
          {loading ? "Reviewing… (up to a minute)" : "Review it"}
        </button>
        {error && <p role="alert" className="text-sm text-[var(--bad)]">{error}</p>}
      </form>

      {result && <Result review={result.review} repository={result.repository} />}
    </main>
  );
}
