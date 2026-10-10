"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { CATEGORIES, type Category, type Review } from "@/lib/review-types";
import { CountUp, Rings } from "./rings";

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

function Panel({ title, index, children }: { title: string; index: number; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      className="card p-6 sm:p-8"
      initial={reduce ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.5 + index * 0.12, ease: [0.22, 1, 0.36, 1] }}
    >
      <h3 className="text-sm font-semibold text-[var(--text-2)]">{title}</h3>
      <div className="mt-4">{children}</div>
    </motion.section>
  );
}

function Items({ items, icon }: { items: string[]; icon: "check" | "fix" | "arrow" }) {
  return (
    <ul className="space-y-3.5">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-[15px] leading-6">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold" style={
            icon === "check"
              ? { background: "var(--accent)", color: "var(--bg)" }
              : icon === "fix"
                ? { border: "1.5px solid var(--text-2)", color: "var(--text-2)" }
                : { color: "var(--accent)" }
          } aria-hidden>
            {icon === "check" ? "✓" : icon === "fix" ? "!" : "→"}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Report({ review, repository, onReset }: { review: Review; repository: string; onReset: () => void }) {
  const [copied, setCopied] = useState(false);
  const reduce = useReducedMotion();

  async function copy() {
    try {
      await navigator.clipboard.writeText(toMarkdown(review, repository));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const panels = [
    review.strengths.length > 0 && { title: "What's working", body: <Items items={review.strengths} icon="check" /> },
    review.improvements.length > 0 && { title: "Fix next", body: <Items items={review.improvements} icon="fix" /> },
    review.roadmap.length > 0 && {
      title: "Roadmap",
      body: (
        <ol className="space-y-3.5">
          {review.roadmap.map((step, i) => (
            <li key={step} className="flex gap-3 text-[15px] leading-6">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-xs font-semibold">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      ),
    },
    review.references.length > 0 && { title: "Worth studying", body: <Items items={review.references} icon="arrow" /> },
  ].filter(Boolean) as { title: string; body: React.ReactNode }[];

  return (
    <article aria-live="polite" className="space-y-4">
      <motion.div
        className="card overflow-hidden p-6 sm:p-10"
        initial={reduce ? false : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex flex-col items-center gap-8 md:flex-row md:items-center md:gap-12">
          <Rings values={CATEGORIES.map((c) => review.breakdown[c])} size={250} stroke={15} gap={4} delay={0.2}>
            <div className="text-center" aria-label={`Score ${review.score} out of 10, ${verdict(review.score)}`}>
              <p className="text-5xl font-semibold leading-none tracking-tight"><CountUp to={review.score} delay={0.2} /></p>
              <p className="mt-1 text-xs font-medium text-[var(--text-2)]">{verdict(review.score)}</p>
            </div>
          </Rings>
          <div className="min-w-0 flex-1">
            <a href={`https://github.com/${repository}`} className="font-mono text-sm text-[var(--accent)] hover:underline">
              {repository}
            </a>
            <p className="mt-3 text-2xl font-semibold leading-snug tracking-tight sm:text-[28px]">{review.summary}</p>
            {review.one_liner && <p className="mt-3 text-[var(--text-2)]">{review.one_liner}</p>}
            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3">
              {CATEGORIES.map((key, i) => (
                <div key={key} className="flex items-center justify-between gap-3 border-t border-[var(--hairline)] pt-3">
                  <dt className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: `var(--ring-${i + 1})` }} />
                    {LABELS[key]}
                  </dt>
                  <dd className="text-sm font-semibold">{review.breakdown[key]}/10</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </motion.div>

      <div className="grid gap-4 md:grid-cols-2">
        {panels.map((p, i) => (
          <Panel key={p.title} title={p.title} index={i}>{p.body}</Panel>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <motion.button whileTap={{ scale: 0.96 }} onClick={copy} className="rounded-full bg-[var(--text)] px-5 py-2.5 text-sm font-medium text-[var(--bg)]">
          {copied ? "Copied" : "Copy as Markdown"}
        </motion.button>
        <motion.button whileTap={{ scale: 0.96 }} onClick={onReset} className="rounded-full bg-[var(--surface-2)] px-5 py-2.5 text-sm font-medium">
          Review another repo
        </motion.button>
        <p className="w-full text-xs text-[var(--text-2)] sm:ml-auto sm:w-auto">
          {review.grounded.liveSite ? "Repo + live site" : "Repo only"}
        </p>
      </div>
    </article>
  );
}
