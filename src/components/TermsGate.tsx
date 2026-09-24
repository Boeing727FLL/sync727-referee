/**
 * TermsGate — one-time Terms of Use acceptance, shown before the disclaimer.
 * TermsGateBody renders inside the v12 landing card; TermsGateModal wraps it
 * in a v12 sheet for the /app route. Reading a document swaps the card
 * content in place (no extra window, no loading).
 */
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { LegalBody, useLegal } from './LegalContent';
import { useLanguage } from '../hooks/useLanguage';

export function TermsGateBody({ onAccept }: { onAccept: () => void }) {
  const legal = useLegal();
  const { t, isRTL } = useLanguage();
  const [agree, setAgree] = useState(false);
  const [reading, setReading] = useState<'terms' | 'privacy' | null>(null);
  const Chev = isRTL ? ChevronLeft : ChevronRight;
  const Back = isRTL ? ChevronRight : ChevronLeft;

  if (reading) {
    const doc = legal[reading];
    return (
      <div className="v12-gate" dir={isRTL ? 'rtl' : 'ltr'}>
        <button type="button" className="v12-gate-back" onClick={() => setReading(null)}>
          <Back className="w-4 h-4" />{t('common.back')}
        </button>
        <h2 className="v12-gate-doc-title">{doc.title}</h2>
        <div className="v12-gate-scroll no-scrollbar"><LegalBody doc={doc} /></div>
      </div>
    );
  }
  return (
    <div className="v12-gate" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="v12-ph v12-gate-ph"><h2>{legal.gate.title.replace(/\.?$/, '.')}</h2><div className="s">{legal.gate.sub}</div></div>
      <div className="v12-gate-links">
        <button type="button" onClick={() => setReading('terms')}><span>{legal.gate.readTerms}</span><Chev className="w-4 h-4" /></button>
        <button type="button" onClick={() => setReading('privacy')}><span>{legal.gate.readPrivacy}</span><Chev className="w-4 h-4" /></button>
      </div>
      <label className={`v12-gate-check ${agree ? 'is-on' : ''}`}>
        <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
        <span className="box" aria-hidden>{agree && <Check className="w-3.5 h-3.5" strokeWidth={3.5} />}</span>
        <span>{legal.gate.check}</span>
      </label>
      <button type="button" className="v12-go" disabled={!agree} onClick={onAccept}>{legal.gate.cta}</button>
      <div className="v12-hint">{legal.terms.note}</div>
    </div>
  );
}

export default function TermsGateModal({ isOpen, onAccept }: { isOpen: boolean; onAccept: () => void }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[9500] v12-scrim flex items-center justify-center modal-safe-4">
      <div className="v12-sheet w-full max-w-md p-6" role="dialog" aria-modal="true">
        <TermsGateBody onAccept={onAccept} />
      </div>
    </div>
  );
}
