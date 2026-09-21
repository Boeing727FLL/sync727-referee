/** Empty-chat start: the composer is the anchor. The starter questions hang
 *  above it as a small association map - nodes on hairline paths that draw
 *  in on arrival and fold away the moment the conversation begins.
 *  No greeting monument, no card grid. */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { MOTION } from '../ui/motion';

type Props = {
  greeting: string;
  questions: string[];
  disabled: boolean;
  onQuestion: (question: string) => void;
  t: (key: string) => string;
};

/** Node positions as fractions of the map area - deliberately asymmetric. */
const NODES = [
  { x: 0.70, y: 0.14 },
  { x: 0.28, y: 0.28 },
  { x: 0.63, y: 0.55 },
  { x: 0.24, y: 0.72 },
];
const ANCHOR = { x: 0.5, y: 0.97 };

export default function ChatHero({ questions, disabled, onQuestion }: Props) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const point = (f: { x: number; y: number }) => ({ x: f.x * size.w, y: f.y * size.h });
  const anchor = point(ANCHOR);
  const ready = size.w > 0 && size.h > 0;

  return (
    <motion.div
      ref={areaRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }}
      transition={MOTION.gentle}
      className="relative h-[54vh] min-h-[340px] max-h-[540px] select-none"
    >
      {ready && (
        <svg viewBox={`0 0 ${size.w} ${size.h}`} className="absolute inset-0 w-full h-full" aria-hidden>
          {questions.map((_, index) => {
            const node = point(NODES[index % NODES.length]);
            const midX = (anchor.x + node.x) / 2;
            const d = `M ${anchor.x} ${anchor.y} C ${midX} ${anchor.y - 46}, ${midX} ${node.y + 34}, ${node.x} ${node.y}`;
            return (
              <motion.path
                key={index}
                d={d}
                fill="none"
                stroke="rgba(255,255,255,0.14)"
                strokeWidth="1"
                pathLength={1}
                initial={{ strokeDashoffset: 1, strokeDasharray: 1 }}
                animate={{ strokeDashoffset: 0 }}
                transition={{ duration: 0.85, delay: 0.12 + index * 0.13, ease: [0.22, 1, 0.36, 1] }}
              />
            );
          })}
          <motion.circle
            cx={anchor.x}
            cy={anchor.y - 2}
            r={4}
            fill="#9fd8c6"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: `${anchor.x}px ${anchor.y - 2}px` }}
          />
        </svg>
      )}
      {ready && questions.map((question, index) => {
        const node = point(NODES[index % NODES.length]);
        return (
          <div
            key={index}
            className="absolute"
            style={{ left: node.x, top: node.y, transform: 'translate(-50%, -50%)' }}
          >
            <motion.button
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              whileTap={{ scale: 0.96 }}
              transition={{ delay: 0.34 + index * 0.13, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => onQuestion(question)}
              disabled={disabled}
              className={`group flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${NODES[index % NODES.length].x < 0.5 ? "flex-row-reverse" : ""}`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 transition-colors duration-300 ${index === 2 ? 'bg-[#ff7a66]/80' : 'bg-[#9fd8c6]/80'} group-hover:bg-[#9fd8c6]`} aria-hidden />
              <span className={`text-[13px] md:text-sm font-bold text-white/70 group-hover:text-white transition-colors duration-300 leading-snug max-w-[140px] md:max-w-[200px] ${NODES[index % NODES.length].x < 0.5 ? "text-start" : "text-end"}`}>{question}</span>
            </motion.button>
          </div>
        );
      })}
    </motion.div>
  );
}
