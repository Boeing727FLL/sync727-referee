/**
 * FeedbackModal — the floating 5-star rating prompt (user-facing).
 *
 * WHAT: pops once in a while after a good answer and asks for a star
 * rating plus an optional improvement note. Submits to the feedback log
 * the owner reviews. Falls back to Hebrew for untranslated languages.
 *
 * DESIGN: Apple-calm dark. One centered card, generous air, big tappable
 * stars, a single gold submit pill — nothing blinks, nothing shouts.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, MessageSquareHeart } from 'lucide-react';
import { logRefereeFeedback } from '../lib/analytics';
import { useLanguage } from '../hooks/useLanguage';

// ---------------------------------------------------------------------------
// Configuration constants & copy
// ---------------------------------------------------------------------------

/** How long the thank-you state shows before the modal hands back control. */
const THANKS_DELAY_MS = 1500;

type FeedbackLabels = {
  title: string;
  subtitle: string;
  hint: string;
  improvementsTitle: string;
  improvementsHint: string;
  improvementsPlaceholder: string;
  submit: string;
  later: string;
  thanks: string;
};

const LABELS: Record<string, FeedbackLabels> = {
  he: {
    title: 'מה דעתך על השופט הווירטואלי?',
    subtitle: 'הדירוג שלך עוזר לנו לשפר את השופט',
    hint: 'תן ציון',
    improvementsTitle: 'שיפורים שהייתם רוצים לראות?',
    improvementsHint: 'לא כל שיפור ייכנס - ההחלטה על שיפורים היא על שיקול דעת הקבוצה',
    improvementsPlaceholder: 'למשל: תשובות מהירות יותר, הסבר מפורט יותר...',
    submit: 'שליחה',
    later: 'בפעם אחרת',
    thanks: 'תודה על הפידבק!',
  },
  en: {
    title: 'How was the Virtual Referee?',
    subtitle: 'Your rating helps us improve the referee',
    hint: 'Rate your experience',
    improvementsTitle: 'Improvements you would like to see?',
    improvementsHint: 'Not every improvement will be added - decisions are at the team\'s discretion',
    improvementsPlaceholder: 'e.g. faster answers, more detailed explanations...',
    submit: 'Send',
    later: 'Not now',
    thanks: 'Thanks for your feedback!',
  },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void;
  season?: string;
  uid?: string | null;
}

// ---------------------------------------------------------------------------
// Presentational pieces (no hooks, no logic — pure props in, JSX out)
// ---------------------------------------------------------------------------

/** Five big tappable stars with hover preview and a gold fill. */
function StarsInput({ rating, hovered, onRate, onHover }: {
  rating: number;
  hovered: number;
  onRate: (star: number) => void;
  onHover: (star: number) => void;
}) {
  return (
    <div className="flex justify-center gap-1.5" dir="ltr">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          onClick={() => onRate(star)}
          onMouseEnter={() => onHover(star)}
          onMouseLeave={() => onHover(0)}
          className="p-1.5 transition-transform hover:scale-115 active:scale-95 focus:outline-none cursor-pointer"
          aria-label={`${star}`}
        >
          <Star
            className={`w-9 h-9 transition-all ${
              (hovered || rating) >= star
                ? 'text-yellow-300 fill-yellow-300 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]'
                : 'text-slate-600'
            }`}
          />
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The modal: rate -> optionally annotate -> thank
// ---------------------------------------------------------------------------

export default function FeedbackModal({ isOpen, onClose, onSubmit, season, uid }: FeedbackModalProps) {
  const { language } = useLanguage();
  const labels = LABELS[language] || LABELS.he;
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [improvements, setImprovements] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  /** Wipe transient state (rating draft, thank-you flag). */
  const reset = () => {
    setRating(0);
    setHovered(0);
    setImprovements('');
    setSubmitting(false);
    setDone(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  /** Submit requires at least one star; empty notes are simply omitted. */
  const handleSubmit = async () => {
    if (rating <= 0 || submitting) return;
    setSubmitting(true);
    await logRefereeFeedback({
      rating,
      improvements: improvements.trim() || undefined,
      uid,
      season,
      language,
    });
    setSubmitting(false);
    setDone(true);
    setTimeout(() => {
      reset();
      onSubmit();
    }, THANKS_DELAY_MS);
  };

  // No early return on purpose: AnimatePresence needs the tree mounted
  // to play the exit animation.
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9998] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"
          dir="rtl"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.5)] w-full max-w-md overflow-hidden"
          >
            <div className="p-6">
              {done ? (
                <div className="text-center py-8">
                  <div className="relative w-16 h-16 mx-auto mb-4">
                    <div className="absolute -inset-2 bg-emerald-500/20 blur-xl rounded-full" aria-hidden />
                    <div className="relative w-full h-full rounded-full bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center">
                      <MessageSquareHeart className="w-7 h-7 text-emerald-300" />
                    </div>
                  </div>
                  <h3 className="text-lg font-black text-white tracking-tight">{labels.thanks}</h3>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-yellow-400/12 border border-yellow-400/25 flex items-center justify-center">
                        <MessageSquareHeart className="w-[18px] h-[18px] text-yellow-300" />
                      </div>
                      <h3 className="text-lg font-black text-white tracking-tight">{labels.title}</h3>
                    </div>
                    <button
                      onClick={handleClose}
                      aria-label="סגור"
                      className="p-2 rounded-full bg-white/[0.05] text-slate-400 hover:text-white hover:bg-white/10 transition-all active:scale-95 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-[13px] text-slate-400 font-medium text-center mt-1 mb-5">{labels.subtitle}</p>

                  <StarsInput rating={rating} hovered={hovered} onRate={setRating} onHover={setHovered} />
                  <p className="text-center text-[11px] text-slate-500 font-semibold mt-2 mb-5">{labels.hint}</p>

                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm font-bold text-slate-200">{labels.improvementsTitle}</span>
                    </div>
                    <textarea
                      value={improvements}
                      onChange={e => setImprovements(e.target.value)}
                      placeholder={labels.improvementsPlaceholder}
                      rows={2}
                      className="w-full px-4 py-3 rounded-2xl bg-white/[0.05] border border-white/10 text-white text-base md:text-sm placeholder-slate-500 outline-none focus:ring-2 focus:ring-yellow-400/40 focus:border-yellow-400/50 focus:bg-white/[0.07] resize-none transition-all"
                    />
                    <p className="text-[11px] text-slate-500 mt-1.5">{labels.improvementsHint}</p>
                  </div>

                  <div className="flex gap-2.5 mt-5">
                    <button
                      onClick={handleSubmit}
                      disabled={rating <= 0 || submitting}
                      className="flex-1 py-3.5 rounded-2xl bg-gradient-to-b from-yellow-300 to-yellow-500 hover:from-yellow-200 hover:to-yellow-400 text-slate-950 font-black text-[15px] transition-all shadow-[0_8px_24px_rgba(250,204,21,0.3)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed disabled:hover:translate-y-0 cursor-pointer"
                    >
                      {submitting ? '...' : labels.submit}
                    </button>
                    <button
                      onClick={handleClose}
                      className="px-5 py-3.5 rounded-2xl bg-white/[0.06] text-slate-300 text-sm font-bold hover:bg-white/10 hover:text-white transition-all active:scale-[0.98] cursor-pointer"
                    >
                      {labels.later}
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
