"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { CATEGORIES, type Category, type Item, type Review, type Subject } from "@/lib/review-types";
import { Rings } from "./rings";

const LABELS: Record<Category, string> = {
  code_quality: "Code quality",
  originality: "Originality",
  completeness: "Completeness",
  documentation: "Documentation",
};

// Same scale the prompt gives the model. Used on the board cards.
export function verdict(score: number) {
  if (score <= 4) return "Needs work";
  if (score <= 6) return "Decent start";
  if (score <= 8) return "Solid";
  if (score === 9) return "Excellent";
  return "Exceptional";
}

export const formatValue = (v: number | null) => (v === null ? "—" : `${v}/10`);

const itemLine = (i: Item) => `**${i.title}**${i.detail ? `: ${i.detail}` : ""}${i.evidence ? ` _(${i.evidence})_` : ""}`;

export function toMarkdown(review: Review, repository: string) {
  const list = (items: Item[]) => items.map((i) => `- ${itemLine(i)}`).join("\n");
  return [
    `## Review: ${repository} (${review.score}/10)`,
    review.summary,
    review.grounded.read?.length ? `_Read: ${review.grounded.read.join(", ")}_` : "",
    `| ${CATEGORIES.map((c) => LABELS[c]).join(" | ")} |\n|${CATEGORIES.map(() => "---").join("|")}|\n| ${CATEGORIES.map((c) => formatValue(review.breakdown[c])).join(" | ")} |`,
    review.improvements.length && `### Fix next\n${list(review.improvements)}`,
    review.roadmap.length && `### Roadmap\n${review.roadmap.map((r, i) => `${i + 1}. ${itemLine(r)}`).join("\n")}`,
    review.strengths.length && `### What's working\n${list(review.strengths)}`,
    review.references.length && `### Worth studying\n${list(review.references)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

// One line about how much the review saw, decided by the server, not the model.
export function groundingNote(review: Review, kind: Subject["kind"]) {
  const g = review.grounded;
  if (kind === "site") return { label: "Site only", note: "Only the live site was read. The code was not inspected." };
  if (!g.depth) return { label: "Surface read", note: "Older review: based on the README and top-level file names only." };
  const files = (g.read ?? []).filter((f) => f !== "README").length;
  if (g.depth === "deep") return { label: "Deep read", note: `Read the README and ${files} project files, including core source. Files not listed were not opened.` };
  if (g.depth === "partial") return { label: "Partial read", note: "Read the README and a few files. Treat the scores as rough." };
  return { label: "Surface read", note: "Only the README and repo details were readable. The scores are a rough guess." };
}

function ReadLine({ read }: { read: string[] }) {
  const [all, setAll] = useState(false);
  if (!read.length) return null;
  const shown = all ? read : read.slice(0, 4);
  return (
    <p className="mt-2 text-sm text-[var(--text-2)]">
      Read:{" "}
      {shown.map((f, i) => (
        <span key={f}>
          <span className="font-mono text-[13px] text-[var(--text)]">{f}</span>
          {i < shown.length - 1 ? ", " : ""}
        </span>
      ))}
      {read.length > 4 && (
        <button onClick={() => setAll((a) => !a)} className="ml-1.5 text-[var(--accent)] hover:underline">
          {all ? "less" : `+${read.length - 4} more`}
        </button>
      )}
    </p>
  );
}

function Actions({ onCopy, copied, onReset, className = "" }: { onCopy: () => void; copied: boolean; onReset: () => void; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <motion.button whileTap={{ scale: 0.96 }} onClick={onCopy} className="rounded-full bg-[var(--text)] px-4 py-2 text-sm font-medium text-[var(--bg)]">
        {copied ? "Copied" : "Copy as Markdown"}
      </motion.button>
      <motion.button whileTap={{ scale: 0.96 }} onClick={onReset} className="rounded-full bg-[var(--surface-2)] px-4 py-2 text-sm font-medium">
        Review another
      </motion.button>
    </div>
  );
}

function Row({ item, marker, warn, tag }: { item: Item; marker?: React.ReactNode; warn?: boolean; tag?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-t border-[var(--hairline)] first:border-t-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`my-2 flex w-full items-start gap-3 py-1.5 text-left ${warn ? "border-l-[3px] border-[var(--warn)] pl-3" : ""}`}
      >
        {marker}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold leading-snug">{item.title}</span>
            {tag && (
              <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "color-mix(in srgb, var(--warn) 14%, transparent)", color: "var(--warn)" }}>
                {tag}
              </span>
            )}
          </span>
          {item.detail && <span className="mt-0.5 block text-sm leading-relaxed text-[var(--text-2)]">{item.detail}</span>}
          <AnimatePresence initial={false}>
            {open && (
              <motion.span
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="block overflow-hidden"
              >
                <span className="mt-1.5 block text-xs text-[var(--text-2)]">
                  {item.evidence ? (
                    <>
                      Seen in <span className="font-mono text-[var(--text)]">{item.evidence}</span>
                    </>
                  ) : (
                    "No specific file cited."
                  )}
                </span>
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        <svg viewBox="0 0 20 20" className={`mt-1 h-4 w-4 shrink-0 text-[var(--text-2)] transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>
          <path d="M7 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </li>
  );
}

function Panel({ title, index, tone = "normal", children }: { title: string; index: number; tone?: "strong" | "normal" | "quiet"; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const style =
    tone === "strong"
      ? "card p-6 sm:p-7 !border-[color-mix(in_srgb,var(--warn)_40%,transparent)]"
      : tone === "quiet"
        ? "rounded-[28px] border border-dashed border-[var(--hairline)] p-6 sm:p-7"
        : "card p-6 sm:p-7";
  return (
    <motion.section
      className={style}
      initial={reduce ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.15 + index * 0.08, ease: [0.22, 1, 0.36, 1] }}
    >
      <h3 className={`text-base font-semibold ${tone === "quiet" ? "text-[var(--text-2)]" : ""}`}>{title}</h3>
      <ul className={`mt-2 ${tone === "quiet" ? "opacity-80" : ""}`}>{children}</ul>
    </motion.section>
  );
}

export function Report({ review, subject, reviewedAt, reused, onReset }: { review: Review; subject: Subject; reviewedAt: string; reused: boolean; onReset: () => void }) {
  const [copied, setCopied] = useState(false);
  const reduce = useReducedMotion();
  const grounding = groundingNote(review, subject.kind);

  async function copy() {
    try {
      await navigator.clipboard.writeText(toMarkdown(review, subject.label));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article aria-live="polite" className="space-y-4">
      <motion.div
        className="card p-6 sm:p-8"
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <a href={subject.url} className="font-mono text-sm text-[var(--accent)] hover:underline">
                {subject.label}
              </a>
              <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-xs font-medium">{grounding.label}</span>
            </div>
            <ReadLine read={review.grounded.read ?? []} />
            <p className="mt-1 text-xs text-[var(--text-2)]">{grounding.note}</p>
          </div>
          <Actions onCopy={copy} copied={copied} onReset={onReset} className="hidden sm:flex" />
        </div>

        {reused && (
          <p className="mt-4 rounded-2xl bg-[var(--surface-2)] px-4 py-2.5 text-sm">
            Already reviewed {new Date(reviewedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}.{" "}
            <span className="text-[var(--text-2)]">
              {subject.kind === "repo" ? "Same code, same score. Push new code for a fresh review." : "Sites get a fresh review once a week."}
            </span>
          </p>
        )}

        <div className="mt-6 grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-xl font-semibold leading-snug tracking-tight sm:text-2xl">{review.summary}</p>
            {review.one_liner && <p className="mt-2 text-[var(--text-2)]">{review.one_liner}</p>}
          </div>
          <div className="flex items-center gap-5 md:border-l md:border-[var(--hairline)] md:pl-6">
            <Rings values={CATEGORIES.map((c) => review.breakdown[c] ?? 0)} size={116} stroke={7} gap={2} delay={0.2}>
              <span className="text-2xl font-semibold tracking-tight" aria-label={`Score ${review.score} out of 10`}>
                {review.score}
              </span>
            </Rings>
            <dl className="space-y-1.5 text-sm">
              {CATEGORIES.map((key, i) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <dt className="flex items-center gap-2 text-[var(--text-2)]">
                    <span className="h-2 w-2 rounded-full" style={{ background: `var(--ring-${i + 1})` }} />
                    {LABELS[key]}
                  </dt>
                  <dd className="font-semibold">{formatValue(review.breakdown[key])}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </motion.div>

      <div className="grid gap-4 md:grid-cols-2">
        {review.improvements.length > 0 && (
          <Panel title="Fix next" index={0} tone="strong">
            {review.improvements.map((item, i) => (
              <Row key={item.title} item={item} warn tag={i === 0 ? "Highest impact" : undefined} />
            ))}
          </Panel>
        )}
        {review.roadmap.length > 0 && (
          <Panel title="Roadmap" index={1}>
            {review.roadmap.map((item, i) => (
              <Row
                key={item.title}
                item={item}
                marker={<span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-[11px] font-semibold">{i + 1}</span>}
              />
            ))}
          </Panel>
        )}
        {review.strengths.length > 0 && (
          <Panel title="What's working" index={2}>
            {review.strengths.map((item) => (
              <Row key={item.title} item={item} />
            ))}
          </Panel>
        )}
        {review.references.length > 0 && (
          <Panel title="Worth studying" index={3} tone="quiet">
            {review.references.map((item) => (
              <Row key={item.title} item={item} />
            ))}
          </Panel>
        )}
      </div>

      {/* Stays in reach at the bottom of the screen while the report is in view. */}
      <div className="sticky bottom-4 z-10 flex justify-center pt-2">
        <div className="glass rounded-full border border-[var(--hairline)] p-1.5 shadow-lg">
          <Actions onCopy={copy} copied={copied} onReset={onReset} />
        </div>
      </div>
    </article>
  );
}
