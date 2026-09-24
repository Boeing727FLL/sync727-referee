import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, ShieldCheck, FileText } from 'lucide-react';
import { LegalBody, useLegal } from '../components/LegalContent';
import { LanguageProvider, useLanguage } from '../hooks/useLanguage';
import '../features/v12/v12.css';

/** /privacy and /terms: the shared legal copy on a v12 page, in the app language. */
function LegalPageInner() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const kind = pathname.startsWith('/terms') ? 'terms' : 'privacy';
  const legal = useLegal();
  const { t, isRTL } = useLanguage();
  const doc = legal[kind];
  const Icon = kind === 'terms' ? FileText : ShieldCheck;
  const Back = isRTL ? ArrowRight : ArrowLeft;
  return (
    <div className="min-h-screen p-4 md:p-10" dir={isRTL ? 'rtl' : 'ltr'} style={{ background: 'linear-gradient(178deg,#082A63 0%,#0B3478 45%,#0D367A 72%,#22306F 100%)' }}>
      <div className="max-w-2xl mx-auto">
        <button onClick={() => navigate('/')} className="v12-gate-back mb-5"><Back className="w-4 h-4" />{t('common.back')}</button>
        <div className="v12-sheet p-6 md:p-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="v12-emblem"><Icon className="w-6 h-6" /></div>
            <h1 className="v12-sheet-title">{doc.title}</h1>
          </div>
          <div className="v12-sheet-body"><LegalBody doc={doc} /></div>
        </div>
      </div>
    </div>
  );
}

export default function PrivacyPage() {
  return <LanguageProvider><LegalPageInner /></LanguageProvider>;
}
