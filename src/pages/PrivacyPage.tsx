import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { PrivacyContent } from '../components/PrivacyModal';

/**
 * PrivacyPage — the /privacy route. Thin wrapper around the shared
 * PrivacyContent (same copy as the in-app modal), with a back pill.
 */
export default function PrivacyPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-10" dir="rtl">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-300 hover:text-white mb-6 px-4 py-2 rounded-full bg-white/[0.06] border border-white/10 hover:bg-white/10 transition-all cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          חזרה לאפליקציה
        </button>
        <div className="bg-slate-900/70 backdrop-blur-2xl border border-white/10 rounded-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.5)] p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="relative shrink-0">
              <div className="absolute -inset-1.5 bg-blue-500/20 blur-lg rounded-2xl pointer-events-none" aria-hidden />
              <div className="relative w-11 h-11 rounded-2xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-blue-300" />
              </div>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">מדיניות פרטיות</h1>
          </div>
          <div className="text-sm leading-relaxed">
            <PrivacyContent />
          </div>
        </div>
      </div>
    </div>
  );
}
