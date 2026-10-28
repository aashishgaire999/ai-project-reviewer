"use client";

import { animate, motion, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const RING_COLORS = ["var(--ring-1)", "var(--ring-2)", "var(--ring-3)", "var(--ring-4)"];

// Concentric progress rings, one per value (0-10), drawn like activity rings.
export function Rings({
  values,
  size = 220,
  stroke = 18,
  gap = 6,
  delay = 0,
  loop = false,
  children,
}: {
  values: number[];
  size?: number;
  stroke?: number;
  gap?: number;
  delay?: number;
  loop?: boolean;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: !loop, amount: 0.4 });
  const reduce = useReducedMotion();
  const center = size / 2;

  return (
    <div ref={ref} className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90" aria-hidden>
        {values.map((value, i) => {
          const r = center - stroke / 2 - i * (stroke + gap);
          if (r <= stroke / 2) return null;
          const progress = Math.max(0, Math.min(1, value / 10));
          return (
            <g key={i}>
              <circle cx={center} cy={center} r={r} fill="none" stroke={RING_COLORS[i % 4]} strokeOpacity={0.16} strokeWidth={stroke} />
              {progress > 0 && <motion.circle
                cx={center}
                cy={center}
                r={r}
                fill="none"
                stroke={RING_COLORS[i % 4]}
                strokeWidth={stroke}
                strokeLinecap="round"
                // A zero-length arc with round caps shows as a stray dot, so rings
                // fade in as they start drawing and loops never shrink to zero.
                initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                animate={{
                  pathLength: reduce ? progress : loop ? (inView ? [0.06, progress] : 0.06) : inView ? progress : 0,
                  opacity: reduce || inView ? 1 : 0,
                }}
                transition={
                  loop && !reduce
                    ? { duration: 1.6, delay: delay + i * 0.15, ease: [0.22, 1, 0.36, 1], repeat: Infinity, repeatType: "reverse", repeatDelay: 1.8 }
                    : { duration: 1.4, delay: delay + i * 0.15, ease: [0.22, 1, 0.36, 1] }
                }
              />}
            </g>
          );
        })}
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center">{children}</div>}
    </div>
  );
}

// Counts up to a number when it scrolls into view.
export function CountUp({ to, delay = 0, className = "" }: { to: number; delay?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? to : 0);

  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(0, to, { duration: 1.4, delay, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setShown(Math.round(v)) });
    return () => controls.stop();
  }, [inView, reduce, to, delay]);

  return (
    <span ref={ref} className={className}>
      {reduce ? to : shown}
    </span>
  );
}

// Fades and lifts content in as it scrolls into view.
export function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
