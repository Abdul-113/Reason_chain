import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Cable,
  GitMerge,
  Fingerprint,
  Route,
  ShieldCheck
} from 'lucide-react';

// ==========================================
// METHODOLOGY SECTION
// "From data to evidence in five steps."
// A connected horizontal process flow that
// feels like one integrated system.
// ==========================================

const STAGES = [
  {
    num: '01',
    title: 'Connect',
    description: 'Bring operational and compliance data together.',
    Icon: Cable,
    accent: 'cyan'
  },
  {
    num: '02',
    title: 'Map',
    description: 'Translate different source schemas into a shared enterprise model.',
    Icon: GitMerge,
    accent: 'cyan'
  },
  {
    num: '03',
    title: 'Resolve',
    description: 'Create one trusted identity for each entity.',
    Icon: Fingerprint,
    accent: 'cyan'
  },
  {
    num: '04',
    title: 'Reason',
    description: 'Traverse relationships across multiple hops.',
    Icon: Route,
    accent: 'emerald'
  },
  {
    num: '05',
    title: 'Prove',
    description: 'Make every conclusion reviewable and auditable.',
    Icon: ShieldCheck,
    accent: 'emerald'
  }
] as const;

type Accent = 'cyan' | 'emerald';

const ACCENT_STYLES: Record<Accent, {
  dot: string;
  glow: string;
  numColor: string;
  iconBg: string;
  iconBorder: string;
  iconText: string;
  titleColor: string;
  trackDot: string;
}> = {
  cyan: {
    dot: 'bg-cyan-400',
    glow: 'shadow-[0_0_12px_rgba(6,182,212,0.4)]',
    numColor: 'text-cyan-500/20',
    iconBg: 'bg-cyan-500/6',
    iconBorder: 'border-cyan-500/15',
    iconText: 'text-cyan-400',
    titleColor: 'text-cyan-400',
    trackDot: '#06b6d4'
  },
  emerald: {
    dot: 'bg-emerald-400',
    glow: 'shadow-[0_0_12px_rgba(16,185,129,0.4)]',
    numColor: 'text-emerald-500/20',
    iconBg: 'bg-emerald-500/6',
    iconBorder: 'border-emerald-500/15',
    iconText: 'text-emerald-400',
    titleColor: 'text-emerald-400',
    trackDot: '#10b981'
  }
};

export default function MethodologySection() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-80px' });

  return (
    <section
      ref={sectionRef}
      id="how-it-works"
      className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-8 py-20 lg:py-28"
    >
      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="text-center mb-16 lg:mb-20"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-[#091929]/60 border border-cyan-500/15 mb-6">
          <span className="w-[5px] h-[5px] rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-[10px] font-mono text-cyan-400 tracking-[0.15em] uppercase font-bold">
            Methodology
          </span>
        </div>
        <h2 className="text-3xl sm:text-4xl lg:text-[40px] font-extrabold tracking-tight text-slate-100 leading-[1.15]">
          From data to evidence
          <br className="hidden sm:inline" />
          {' '}in{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">
            five steps.
          </span>
        </h2>
      </motion.div>

      {/* ============================================ */}
      {/* DESKTOP: Horizontal connected process flow   */}
      {/* ============================================ */}
      <div className="hidden lg:block">
        {/* Horizontal Track SVG */}
        <div className="relative">
          {/* The connecting rail */}
          <svg
            className="absolute top-[28px] left-0 w-full h-[4px] pointer-events-none overflow-visible"
            preserveAspectRatio="none"
          >
            {/* Base track line */}
            <line
              x1="10%"
              y1="2"
              x2="90%"
              y2="2"
              stroke="#0e1c2e"
              strokeWidth="1.5"
            />
            {/* Active track overlay — draws on scroll */}
            <motion.line
              x1="10%"
              y1="2"
              x2="90%"
              y2="2"
              stroke="url(#track-gradient)"
              strokeWidth="1.5"
              initial={{ pathLength: 0 }}
              animate={isInView ? { pathLength: 1 } : {}}
              transition={{ duration: 2, delay: 0.6, ease: 'easeInOut' }}
            />
            <defs>
              <linearGradient id="track-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.5" />
                <stop offset="60%" stopColor="#06b6d4" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.5" />
              </linearGradient>
            </defs>

            {/* Traveling particle along the track */}
            {isInView && (
              <>
                <circle r="2.5" fill="#06b6d4" opacity="0.7">
                  <animateMotion dur="4s" repeatCount="indefinite" begin="2s">
                    <mpath href="#track-path" />
                  </animateMotion>
                  <animate
                    attributeName="opacity"
                    values="0;0.8;0.8;0"
                    dur="4s"
                    repeatCount="indefinite"
                    begin="2s"
                  />
                </circle>
                <circle r="1.8" fill="#10b981" opacity="0.5">
                  <animateMotion dur="5s" repeatCount="indefinite" begin="3.5s">
                    <mpath href="#track-path" />
                  </animateMotion>
                  <animate
                    attributeName="opacity"
                    values="0;0.6;0.6;0"
                    dur="5s"
                    repeatCount="indefinite"
                    begin="3.5s"
                  />
                </circle>
                <path id="track-path" d="M 140 2 L 1260 2" fill="none" stroke="none" />
              </>
            )}
          </svg>

          {/* Stage nodes on the track */}
          <div className="grid grid-cols-5 gap-0">
            {STAGES.map((stage, i) => {
              const styles = ACCENT_STYLES[stage.accent];
              return (
                <motion.div
                  key={stage.num}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.4 + i * 0.15, ease: 'easeOut' }}
                  className="flex flex-col items-center text-center px-3"
                >
                  {/* Track node dot */}
                  <div className="relative mb-6">
                    <div
                      className={`w-[14px] h-[14px] rounded-full ${styles.dot} ${styles.glow} ring-4 ring-[#050a0f]`}
                    />
                    {/* Subtle pulse ring */}
                    {isInView && (
                      <div
                        className={`absolute inset-[-4px] rounded-full ${styles.dot} opacity-20 animate-ping`}
                        style={{ animationDuration: '3s', animationDelay: `${i * 0.6}s` }}
                      />
                    )}
                  </div>

                  {/* Vertical connector */}
                  <motion.div
                    initial={{ scaleY: 0 }}
                    animate={isInView ? { scaleY: 1 } : {}}
                    transition={{ duration: 0.3, delay: 0.7 + i * 0.15 }}
                    className="w-px h-8 bg-gradient-to-b from-[#0e1c2e] to-transparent origin-top mb-5"
                  />

                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-lg border ${styles.iconBorder} ${styles.iconBg} flex items-center justify-center mb-4`}>
                    <stage.Icon className={`w-[18px] h-[18px] ${styles.iconText}`} strokeWidth={1.6} />
                  </div>

                  {/* Large faded step number */}
                  <span className={`text-[32px] font-extrabold ${styles.numColor} leading-none font-mono mb-1`}>
                    {stage.num}
                  </span>

                  {/* Title */}
                  <h3 className={`text-[13px] font-bold uppercase tracking-[0.15em] ${styles.titleColor} mb-2`}>
                    {stage.title}
                  </h3>

                  {/* Description */}
                  <p className="text-[12px] text-slate-500 leading-relaxed max-w-[180px]">
                    {stage.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* MOBILE/TABLET: Vertical connected flow       */}
      {/* ============================================ */}
      <div className="lg:hidden">
        <div className="relative pl-10">
          {/* Vertical track line */}
          <motion.div
            initial={{ scaleY: 0 }}
            animate={isInView ? { scaleY: 1 } : {}}
            transition={{ duration: 1.5, delay: 0.4, ease: 'easeInOut' }}
            className="absolute left-[14px] top-0 bottom-0 w-px bg-gradient-to-b from-cyan-500/30 via-cyan-500/20 to-emerald-500/30 origin-top"
          />

          <div className="space-y-10">
            {STAGES.map((stage, i) => {
              const styles = ACCENT_STYLES[stage.accent];
              return (
                <motion.div
                  key={stage.num}
                  initial={{ opacity: 0, x: -12 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.45, delay: 0.5 + i * 0.12, ease: 'easeOut' }}
                  className="relative flex items-start gap-5"
                >
                  {/* Node dot on the vertical rail */}
                  <div className="absolute -left-10 top-1">
                    <div
                      className={`w-[10px] h-[10px] rounded-full ${styles.dot} ${styles.glow} ring-3 ring-[#050a0f]`}
                    />
                  </div>

                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-lg border ${styles.iconBorder} ${styles.iconBg} flex items-center justify-center shrink-0`}>
                    <stage.Icon className={`w-4 h-4 ${styles.iconText}`} strokeWidth={1.6} />
                  </div>

                  {/* Content */}
                  <div>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className={`text-[11px] font-mono font-bold ${styles.titleColor} tracking-[0.1em]`}>
                        {stage.num}
                      </span>
                      <h3 className={`text-[13px] font-bold uppercase tracking-[0.12em] ${styles.titleColor}`}>
                        {stage.title}
                      </h3>
                    </div>
                    <p className="text-[12px] text-slate-500 leading-relaxed max-w-xs">
                      {stage.description}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom separator accent */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ duration: 0.8, delay: 1.8 }}
        className="mt-16 lg:mt-20 flex items-center justify-center gap-3"
      >
        <div className="h-px w-12 bg-gradient-to-r from-transparent to-[#0e1c2e]" />
        <span className="text-[9px] font-mono text-slate-600 uppercase tracking-[0.2em]">
          Enterprise Data → Relationships → Multi-Hop Reasoning → Verification → Proof
        </span>
        <div className="h-px w-12 bg-gradient-to-l from-transparent to-[#0e1c2e]" />
      </motion.div>
    </section>
  );
}
