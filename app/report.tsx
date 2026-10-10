"use client";

import { useState } from "react";
import { CATEGORIES, type Category, type Review } from "@/lib/review-types";

const LABELS: Record<Category, string> = {
  code_quality: "Code quality",
  originality: "Originality",
  completeness: "Completeness",
  documentation: "Documentation",
};

// Same scale the prompt gives the model.
export function verdict(score: number) {
  if (score <= 4) return "Needs work";
  if (score <= 6) return "Decent start";
  if (score <= 8) return "Solid";
  if (score === 9) return "Excellent";
  return "Exceptional";
}

export function toMarkdown(review: Review, repository: string) {
  const list = (items: string[]) => items.map((i) => `- ${i}`).join("\n");
  return [
    `## Review: ${repository} (${review.score}/10, ${verdict(review.score)})`,
    review.summary,
    `| ${CATEGORIES.map((c) => LABELS[c]).join(" | ")} |\n|${CATEGORIES.map(() => "---").join("|")}|\n| ${CATEGORIES.map((c) => `${review.breakdown[c]}/10`).join(" | ")} |`,
    review.strengths.length && `### Strengths\n${list(review.strengths)}`,
    review.improvements.length && `### Fix next\n${list(review.improvements)}`,
    review.roadmap.length && `### Roadmap\n${review.roadmap.map((r, i) => `${i + 1}. ${r}`).join("\n")}`,
    review.references.length && `### Worth studying\n${list(review.references)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function Stamp({ score }: { score: number }) {
  return (
    <div className="stamp-in grid h-36 w-36 shrink-0 place-items-center rounded-full border-[3px] border-[var(--stamp)] text-[var(--stamp)]" aria-label={`Score ${score} out of 10, ${verdict(score)}`}>
      <div className="grid h-[122px] w-[122px] place-items-center rounded-full border border-dashed border-[var(--stamp)] text-center">
        <div>
          <p className="font-display text-6xl font-bold leading-none">{score}</p>
          <p className="font-mono mt-1 text-[10px] uppercase tracking-[0.25em]">{verdict(score)}</p>
        </div>
      </div>
    </div>
  );
}

function Gauge({ label, value, delay }: { label: string; value: number; delay: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium">{label}</p>
        <p className="font-mono text-sm text-[var(--ink-2)]">{value}/10</p>
      </div>
      <div className="relative mt-2 h-3 rounded-full border border-[var(--ink)]">
        <div className="grow absolute inset-y-0 left-0 rounded-full bg-[var(--ink)]" style={{ width: `${value * 10}%`, animationDelay: `${delay}ms` }} />
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className="absolute inset-y-0 w-px bg-[var(--paper)] opacity-60" style={{ left: `${(i + 1) * 10}%` }} />
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--ink-2)]">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Items({ items, mark, color }: { items: string[]; mark: string; color: string }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item} className="flex gap-3 leading-6">
          <span className="font-mono mt-px font-semibold" style={{ color }} aria-hidden>{mark}</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Report({ review, repository, onReset }: { review: Review; repository: string; onReset: () => void }) {
  const [copied, setCopied] = useState(false);
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  async function copy() {
    try {
      await navigator.clipboard.writeText(toMarkdown(review, repository));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className="rounded-lg border-[1.5px] border-[var(--ink)] bg-[var(--card)] shadow-[6px_6px_0_var(--ink)]" aria-live="polite">
      <header className="font-mono flex flex-wrap items-center justify-between gap-2 border-b-[1.5px] border-dashed border-[var(--ink)] px-5 py-3 text-xs uppercase tracking-[0.2em] sm:px-8">
        <span>Inspection report</span>
        <span className="text-[var(--ink-2)]">{today}</span>
      </header>

      <div className="space-y-10 p-5 sm:p-8">
        <div className="flex flex-col-reverse gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xl">
            <a href={`https://github.com/${repository}`} className="font-mono text-sm text-[var(--ink-2)] underline decoration-[var(--line-strong)] underline-offset-4 hover:text-[var(--ink)]">
              github.com/{repository}
            </a>
            <p className="font-display mt-3 text-2xl leading-snug sm:text-[28px]">{review.summary}</p>
            {review.one_liner && <p className="mt-4 border-l-[3px] border-[var(--stamp)] pl-4 italic text-[var(--ink-2)]">{review.one_liner}</p>}
          </div>
          <Stamp score={review.score} />
        </div>

        <div className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
          {CATEGORIES.map((key, i) => (
            <Gauge key={key} label={LABELS[key]} value={review.breakdown[key]} delay={i * 120} />
          ))}
        </div>

        <div className="grid gap-10 border-t border-[var(--line)] pt-8 md:grid-cols-2">
          {review.strengths.length > 0 && (
            <Section title="What's working"><Items items={review.strengths} mark="✓" color="var(--pass)" /></Section>
          )}
          {review.improvements.length > 0 && (
            <Section title="Fix next"><Items items={review.improvements} mark="✕" color="var(--stamp)" /></Section>
          )}
          {review.roadmap.length > 0 && (
            <Section title="Roadmap">
              <ol className="space-y-2.5">
                {review.roadmap.map((step, i) => (
                  <li key={step} className="flex gap-3 leading-6">
                    <span className="font-mono grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[var(--ink)] text-xs">{i + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </Section>
          )}
          {review.references.length > 0 && (
            <Section title="Worth studying"><Items items={review.references} mark="→" color="var(--ink-2)" /></Section>
          )}
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t-[1.5px] border-dashed border-[var(--ink)] px-5 py-4 sm:px-8">
        <button onClick={copy} className="rounded-full border-[1.5px] border-[var(--ink)] px-4 py-2 text-sm font-medium hover:bg-[var(--ink)] hover:text-[var(--paper)]">
          {copied ? "Copied ✓" : "Copy as Markdown"}
        </button>
        <button onClick={onReset} className="rounded-full px-4 py-2 text-sm font-medium underline underline-offset-4">
          Review another repo
        </button>
        <p className="w-full text-xs text-[var(--ink-2)] sm:ml-auto sm:w-auto">
          Based on {review.grounded.repository ? "the repo's README, files and languages" : "limited repo data"}
          {review.grounded.liveSite ? " and the live site" : ""}. A second opinion, not a verdict.
        </p>
      </footer>
    </article>
  );
}
