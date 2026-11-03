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
  if (!read.length) return null;
  const shown = read.slice(0, 3);
  return (
    <p className="mt-1 truncate text-xs text-[var(--text-2)]" title={`Read: ${read.join(", ")}`}>
      Read: <span className="font-mono text-[var(--text)]">{shown.join(", ")}</span>
      {read.length > 3 && <span> +{read.length - 3} more</span>}
    </p>
  );
}

function Actions({ onCopy, copied, onReset }: { onCopy: () => void; copied: boolean; onReset: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <motion.button whileTap={{ scale: 0.96 }} onClick={onCopy} className="rounded-full bg-[var(--text)] px-3.5 py-1.5 text-xs font-medium text-[var(--bg)]">
        {copied ? "Copied" : "Copy as Markdown"}
      </motion.button>
      <motion.button whileTap={{ scale: 0.96 }} onClick={onReset} className="rounded-full bg-[var(--surface-2)] px-3.5 py-1.5 text-xs font-medium">
        Review another
      </motion.button>
    </div>
  );
}

// Collapsed: title plus one line of detail. Open: the full detail and the
// file it was seen in.
function Row({ item, marker, warn, tag }: { item: Item; marker?: React.ReactNode; warn?: boolean; tag?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-t border-[var(--hairline)] first:border-t-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`my-1 flex w-full items-start gap-2.5 py-1.5 text-left ${warn ? "border-l-[3px] border-[var(--warn)] pl-2.5" : ""}`}
      >
        {marker}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{item.title}</span>
            {tag && (
              <span className="shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold" style={{ background: "color-mix(in srgb, var(--warn) 14%, transparent)", color: "var(--warn)" }}>
                {tag}
              </span>
            )}
          </span>
          {item.detail && <span className={`block text-[13px] leading-snug text-[var(--text-2)] ${open ? "" : "truncate"}`}>{item.detail}</span>}
          <AnimatePresence initial={false}>
            {open && (
              <motion.span initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="block overflow-hidden">
                <span className="mt-1 block text-xs text-[var(--text-2)]">
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
        <svg viewBox="0 0 20 20" className={`mt-0.5 h-4 w-4 shrink-0 text-[var(--text-2)] transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>
          <path d="M7 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </li>
  );
}

type Tone = "strong" | "normal" | "quiet";
type PanelSpec = { key: string; title: string; short: string; tone: Tone; body: React.ReactNode };

function panelClass(tone: Tone) {
  if (tone === "strong") return "card !rounded-2xl p-4 !border-[color-mix(in_srgb,var(--warn)_40%,transparent)]";
  if (tone === "quiet") return "rounded-2xl border border-dashed border-[var(--hairline)] p-4";
  return "card !rounded-2xl p-4";
}

function Panel({ spec, index }: { spec: PanelSpec; index: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      className={panelClass(spec.tone)}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 + index * 0.06, ease: [0.22, 1, 0.36, 1] }}
    >
      <h3 className={`text-sm font-semibold ${spec.tone === "quiet" ? "text-[var(--text-2)]" : ""}`}>{spec.title}</h3>
      <ul className={`mt-1 ${spec.tone === "quiet" ? "opacity-80" : ""}`}>{spec.body}</ul>
    </motion.section>
  );
}

// On phones the four panels become tabs, so the report still fits one screen.
function PanelTabs({ panels }: { panels: PanelSpec[] }) {
  const [active, setActive] = useState(panels[0]?.key);
  const current = panels.find((p) => p.key === active) ?? panels[0];
  if (!current) return null;
  return (
    <div className="md:hidden">
      <div role="tablist" className="flex gap-1 rounded-full bg-[var(--surface-2)] p-1">
        {panels.map((p) => (
          <button
            key={p.key}
            role="tab"
            aria-selected={p.key === current.key}
            onClick={() => setActive(p.key)}
            className={`flex-1 rounded-full px-2 py-1.5 text-xs font-medium transition-colors ${p.key === current.key ? "bg-[var(--surface)] shadow-sm" : "text-[var(--text-2)]"}`}
          >
            {p.short}
          </button>
        ))}
      </div>
      <div className="mt-3" role="tabpanel">
        <Panel spec={current} index={0} />
      </div>
    </div>
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

  const panels: PanelSpec[] = [
    review.improvements.length > 0 && {
      key: "fix",
      title: "Fix next",
      short: "Fix next",
      tone: "strong" as Tone,
      body: review.improvements.map((item, i) => <Row key={item.title} item={item} warn tag={i === 0 ? "Highest impact" : undefined} />),
    },
    review.roadmap.length > 0 && {
      key: "roadmap",
      title: "Roadmap",
      short: "Roadmap",
      tone: "normal" as Tone,
      body: review.roadmap.map((item, i) => (
        <Row
          key={item.title}
          item={item}
          marker={<span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-[10px] font-semibold">{i + 1}</span>}
        />
      )),
    },
    review.strengths.length > 0 && {
      key: "working",
      title: "What's working",
      short: "Working",
      tone: "normal" as Tone,
      body: review.strengths.map((item) => <Row key={item.title} item={item} />),
    },
    review.references.length > 0 && {
      key: "study",
      title: "Worth studying",
      short: "Study",
      tone: "quiet" as Tone,
      body: review.references.map((item) => <Row key={item.title} item={item} />),
    },
  ].filter(Boolean) as PanelSpec[];

  return (
    <article aria-live="polite" className="space-y-3">
      <motion.div
        className="card !rounded-2xl p-4 sm:p-5"
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-start gap-4">
          <Rings values={CATEGORIES.map((c) => review.breakdown[c] ?? 0)} size={84} stroke={6} gap={2} delay={0.15}>
            <span className="text-xl font-semibold tracking-tight" aria-label={`Score ${review.score} out of 10`}>
              {review.score}
            </span>
          </Rings>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <a href={subject.url} className="truncate font-mono text-sm text-[var(--accent)] hover:underline">
                  {subject.label}
                </a>
                <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-medium" title={grounding.note}>
                  {grounding.label}
                </span>
              </div>
              <div className="hidden sm:block">
                <Actions onCopy={copy} copied={copied} onReset={onReset} />
              </div>
            </div>
            <ReadLine read={review.grounded.read ?? []} />
            <p className="mt-1.5 line-clamp-3 text-[15px] font-medium leading-snug sm:line-clamp-2" title={review.summary}>
              {review.summary}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-[var(--hairline)] pt-3 text-xs">
          <dl className="flex flex-wrap gap-x-4 gap-y-1">
            {CATEGORIES.map((key, i) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: `var(--ring-${i + 1})` }} />
                <dt className="text-[var(--text-2)]">{LABELS[key]}</dt>
                <dd className="font-semibold">{formatValue(review.breakdown[key])}</dd>
              </div>
            ))}
          </dl>
          {reused && (
            <span className="text-[var(--text-2)]">
              Saved review from {new Date(reviewedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })} ·{" "}
              {subject.kind === "repo" ? "same code, same score" : "refreshes weekly"}
            </span>
          )}
        </div>
        <div className="mt-3 sm:hidden">
          <Actions onCopy={copy} copied={copied} onReset={onReset} />
        </div>
      </motion.div>

      <div className="hidden gap-3 md:grid md:grid-cols-2">
        {panels.map((spec, i) => (
          <Panel key={spec.key} spec={spec} index={i} />
        ))}
      </div>
      <PanelTabs panels={panels} />
    </article>
  );
}
