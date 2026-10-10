"use client";

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { Rings } from "./rings";

const FILES = [
  { name: "README.md", depth: 0 },
  { name: "app/", depth: 0 },
  { name: "page.tsx", depth: 1 },
  { name: "api/review/route.ts", depth: 1 },
  { name: "lib/", depth: 0 },
  { name: "safe-url.ts", depth: 1 },
  { name: "review.ts", depth: 1 },
  { name: "test/", depth: 0 },
  { name: "package.json", depth: 0 },
];

const BARS = [
  { label: "Code quality", value: 8 },
  { label: "Originality", value: 6 },
  { label: "Completeness", value: 7 },
  { label: "Docs", value: 9 },
];

// A product shot of the reviewer at work. It tilts toward the pointer.
export function HeroWindow() {
  const reduce = useReducedMotion();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-9, 9]), { stiffness: 120, damping: 18 });
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [7, -7]), { stiffness: 120, damping: 18 });

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (reduce || e.pointerType !== "mouse") return;
    const rect = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - rect.left) / rect.width - 0.5);
    py.set((e.clientY - rect.top) / rect.height - 0.5);
  }

  return (
    <div className="relative mx-auto w-full max-w-4xl [perspective:1400px]" onPointerMove={onMove} onPointerLeave={() => { px.set(0); py.set(0); }}>
      <div className="pointer-events-none absolute inset-x-10 top-10 bottom-0 rounded-full blur-3xl" style={{ background: "var(--glow)" }} aria-hidden />
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 60, rotateX: 18, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
        transition={{ duration: 1.2, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="card relative overflow-hidden !rounded-[22px]"
        role="img"
        aria-label="The reviewer scanning a repository's files and filling four score rings"
      >
        <div className="flex items-center gap-2 border-b border-[var(--hairline)] px-4 py-3">
          {[0, 1, 2].map((i) => <span key={i} className="h-3 w-3 rounded-full bg-[var(--text-2)] opacity-30" />)}
          <span className="font-mono mx-auto truncate whitespace-nowrap rounded-md bg-[var(--surface-2)] px-3 py-1 text-xs text-[var(--text-2)]">github.com/you/your-project</span>
          <span className="w-12" />
        </div>
        <div className="grid sm:grid-cols-[1fr_1.15fr]">
          <div className="relative border-b border-[var(--hairline)] p-5 sm:border-b-0 sm:border-r">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-2)]">Reading</p>
            <ul className="font-mono relative mt-3 space-y-1.5 text-[13px]">
              {FILES.map((f) => (
                <li key={f.name} className="flex items-center gap-2" style={{ paddingLeft: f.depth * 18 }}>
                  <span className={`h-1.5 w-1.5 rounded-full ${f.name.endsWith("/") ? "bg-[var(--accent)]" : "bg-[var(--text-2)] opacity-50"}`} />
                  <span className={f.name.endsWith("/") ? "font-medium" : "text-[var(--text-2)]"}>{f.name}</span>
                </li>
              ))}
              {!reduce && (
                <motion.li
                  aria-hidden
                  className="pointer-events-none absolute inset-x-[-8px] h-7 rounded-lg"
                  style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", top: 0 }}
                  animate={{ y: [0, 208, 0] }}
                  transition={{ duration: 5, ease: "easeInOut", repeat: Infinity }}
                />
              )}
            </ul>
          </div>
          <div className="flex items-center gap-6 p-5">
            <Rings values={BARS.map((b) => b.value)} size={164} stroke={10} gap={3} delay={1} loop>
              <span className="text-3xl font-semibold tracking-tight">8</span>
            </Rings>
            <ul className="min-w-0 flex-1 space-y-3 text-sm">
              {BARS.map((b, i) => (
                <li key={b.label}>
                  <div className="flex justify-between">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: `var(--ring-${i + 1})` }} />
                      {b.label}
                    </span>
                    <span className="text-[var(--text-2)]">{b.value}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
