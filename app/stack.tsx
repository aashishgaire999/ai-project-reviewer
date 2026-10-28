"use client";

import { motion, useMotionValue, useReducedMotion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { CATEGORIES, type BoardEntry } from "@/lib/review-types";
import { verdict } from "./report";
import { Reveal, Rings } from "./rings";

function ago(iso: string) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 60) return minutes <= 1 ? "just now" : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function Card({ entry }: { entry: BoardEntry }) {
  return (
    <a href={entry.subject.url} className="card flex w-[200px] flex-col items-center gap-3 p-5 transition-transform hover:-translate-y-1 sm:w-[240px]">
      <Rings values={CATEGORIES.map((c) => entry.breakdown[c] ?? 0)} size={140} stroke={10} gap={3}>
        <span className="text-3xl font-semibold tracking-tight">{entry.score}</span>
      </Rings>
      <span className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-medium">{verdict(entry.score)}</span>
      <p className="font-mono w-full truncate text-center text-xs" title={entry.subject.label}>{entry.subject.label}</p>
      <p className="text-xs text-[var(--text-2)]">
        {entry.subject.kind === "site" ? "Site · " : ""}
        {ago(entry.reviewedAt)}
      </p>
    </a>
  );
}

function SpreadCard({ spread, side, offset, entry }: { spread: MotionValue<number>; side: number; offset: number; entry: BoardEntry }) {
  const x = useTransform(spread, [0, 1], [0, side * offset]);
  const y = useTransform(spread, [0, 1], [0, Math.abs(side) * 24]);
  const rotate = useTransform(spread, [0, 1], [0, side * 9]);
  return (
    <motion.div className="absolute" style={{ x, y, rotate, zIndex: side === 0 ? 2 : 1 }}>
      <Card entry={entry} />
    </motion.div>
  );
}

// The three newest shared reviews fan out as the section scrolls in; older
// ones sit in a row below. Every card is a real saved review.
export function Board({ entries }: { entries: BoardEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const fullySpread = useMotionValue(1);
  const [offset, setOffset] = useState(230);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const update = () => setOffset(media.matches ? 105 : 230);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const fan = entries.slice(0, 3);
  // Newest in the middle, then left, then right.
  const sides = fan.length === 1 ? [0] : fan.length === 2 ? [-0.5, 0.5] : [0, -1, 1];
  const rest = entries.slice(3);

  return (
    <div>
      <Reveal>
        <h2 className="text-center text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
          <span className="headline-gradient">Fresh off the</span> <span className="accent-gradient">board.</span>
        </h2>
      </Reveal>
      <div ref={ref} className="relative mt-6 flex h-[400px] items-center justify-center">
        <div className="pointer-events-none absolute inset-x-1/4 inset-y-10 rounded-full blur-3xl" style={{ background: "var(--glow)" }} aria-hidden />
        {fan.map((entry, i) => (
          <SpreadCard key={entry.subject.key} entry={entry} side={sides[i]} offset={offset} spread={reduce ? fullySpread : scrollYProgress} />
        ))}
      </div>
      {rest.length > 0 && (
        <div className="mx-auto mt-6 max-w-6xl snap-x overflow-x-auto px-1 pb-4">
          <div className="mx-auto flex w-max gap-4">
            {rest.map((entry, i) => (
              <Reveal key={entry.subject.key} delay={Math.min(i, 6) * 0.06} className="snap-start">
                <Card entry={entry} />
              </Reveal>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
