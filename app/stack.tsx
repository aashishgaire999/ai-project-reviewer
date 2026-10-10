"use client";

import { motion, useMotionValue, useReducedMotion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Rings } from "./rings";

// Illustrative score cards that fan out as the section scrolls into view.
const CARDS = [
  { values: [6, 5, 7, 4], score: 6, label: "Decent start", side: -1 },
  { values: [9, 8, 9, 9], score: 9, label: "Excellent", side: 0 },
  { values: [8, 6, 7, 8], score: 7, label: "Solid", side: 1 },
];

function Card({ values, score, label }: { values: number[]; score: number; label: string }) {
  return (
    <div className="card flex w-[200px] flex-col items-center gap-4 p-6 sm:w-[250px]">
      <Rings values={values} size={150} stroke={10} gap={3} loop>
        <span className="text-3xl font-semibold tracking-tight">{score}</span>
      </Rings>
      <span className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-medium">{label}</span>
      <div className="w-full space-y-2" aria-hidden>
        {values.map((v, i) => (
          <div key={i} className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div className="h-full rounded-full" style={{ width: `${v * 10}%`, background: `var(--ring-${i + 1})` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SpreadCard({ spread, side, offset, ...card }: { spread: MotionValue<number>; side: number; offset: number; values: number[]; score: number; label: string }) {
  const x = useTransform(spread, [0, 1], [0, side * offset]);
  const y = useTransform(spread, [0, 1], [0, Math.abs(side) * 24]);
  const rotate = useTransform(spread, [0, 1], [0, side * 9]);
  return (
    <motion.div className="absolute" style={{ x, y, rotate, zIndex: side === 0 ? 2 : 1 }}>
      <Card {...card} />
    </motion.div>
  );
}

export function CardStack() {
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

  return (
    <div ref={ref} className="relative flex h-[420px] items-center justify-center" role="img" aria-label="Three example score cards with rings for each category">
      <div className="pointer-events-none absolute inset-x-1/4 inset-y-10 rounded-full blur-3xl" style={{ background: "var(--glow)" }} aria-hidden />
      {CARDS.map((c) => (
        <SpreadCard key={c.score} spread={reduce ? fullySpread : scrollYProgress} offset={offset} {...c} />
      ))}
    </div>
  );
}
