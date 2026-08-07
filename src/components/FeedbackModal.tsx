import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, MessageSquareHeart } from 'lucide-react';
import { logRefereeFeedback } from '../lib/analytics';
import { useLanguage } from '../hooks/useLanguage';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void;
  season?: string;
  uid?: string | null;
}

const LABELS: Record<string, { title: string; subtitle: string; hint: string; placeholder: string; improvementsTitle: string; improvementsHint: string; improvementsPlaceholder: string; submit: string; later: string; thanks: string }> = {
  he: {
    title: 'מה דעתך על השופט הווירטואלי?',
    subtitle: 'הדירוג שלך עוזר לנו לשפר את השופט',
    hint: 'תן ציון',
    placeholder: 'מה אפשר לשפר? (לא חובה)',
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
    placeholder: 'What can we improve? (optional)',
    improvementsTitle: 'Improvements you would like to see?',
    improvementsHint: 'Not every improvement will be added - decisions are at the team\'s discretion',
    improvementsPlaceholder: 'e.g. faster answers, more detailed explanations...',
    submit: 'Send',
    later: 'Not now',
    thanks: 'Thanks for your feedback!',
  },
};

export default function FeedbackModal({ isOpen, onClose, onSubmit, season, uid }: FeedbackModalProps) {
  const { language } = useLanguage();
  const labels = LABELS[language] || LABELS.he;
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [improvements, setImprovements] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const reset = () => {
    setRating(0);
    setHovered(0);
    setComment('');
    setImprovements('');
    setSubmitting(false);
    setDone(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (rating <= 0 || submitting) return;
    setSubmitting(true);
    await logRefereeFeedback({
      rating,
      comment: comment.trim() || undefined,
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
    }, 1500);
  };

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
            initial={{ scale: 0.85, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 30 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="p-5">
              {done ? (
                <div className="text-center py-6">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/15 flex items-center justify-center">
                    <MessageSquareHeart className="w-8 h-8 text-emerald-400" />
                  </div>
                  <h3 className="text-lg font-black text-white mb-1">{labels.thanks}</h3>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <MessageSquareHeart className="w-5 h-5 text-yellow-400" />
                      <h3 className="text-lg font-black text-white">{labels.title}</h3>
                    </div>
                    <button onClick={handleClose} className="text-slate-500 hover:text-white transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <p className="text-sm text-slate-400 mb-4">{labels.subtitle}</p>

                  <div className="flex justify-center gap-1 mb-2" dir="ltr">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHovered(star)}
                        onMouseLeave={() => setHovered(0)}
                        className="p-1 transition-transform hover:scale-125 focus:outline-none"
                        aria-label={`${star}`}
                      >
                        <Star
                          className={`w-9 h-9 transition-colors ${
                            (hovered || rating) >= star ? 'text-yellow-400 fill-yellow-400' : 'text-slate-600'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                  <p className="text-center text-xs text-slate-500 mb-4">{labels.hint}</p>

                  <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder={labels.placeholder}
                    rows={2}
                    className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-yellow-500/40 focus:border-yellow-500 resize-none"
                  />

                  <div className="mt-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-white">{labels.improvementsTitle}</span>
                    </div>
                    <textarea
                      value={improvements}
                      onChange={e => setImprovements(e.target.value)}
                      placeholder={labels.improvementsPlaceholder}
                      rows={2}
                      className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-yellow-500/40 focus:border-yellow-500 resize-none"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">{labels.improvementsHint}</p>
                  </div>

                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={handleSubmit}
                      disabled={rating <= 0 || submitting}
                      className="flex-1 py-2.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-black transition-colors shadow-lg shadow-yellow-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {submitting ? '...' : labels.submit}
                    </button>
                    <button
                      onClick={handleClose}
                      className="px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-bold hover:bg-slate-700 transition-colors"
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
