/** Shared renderer for the Terms of Use and Privacy Policy (modal, pages and the terms gate). */
import { legalFor, type LegalDoc } from '../legal/copy';
import { useLanguage } from '../hooks/useLanguage';

const MAIL = 'boeing727.il@gmail.com';

function Text({ s }: { s: string }) {
  const i = s.indexOf(MAIL);
  if (i < 0) return <>{s}</>;
  return <>{s.slice(0, i)}<a href={`mailto:${MAIL}`} dir="ltr" className="v12-legal-mail">{MAIL}</a>{s.slice(i + MAIL.length)}</>;
}

export function LegalBody({ doc }: { doc: LegalDoc }) {
  return (
    <div className="v12-legal">
      <div className="v12-legal-updated">{doc.updated}</div>
      {doc.note && <p className="v12-legal-note">{doc.note}</p>}
      {doc.intro && <p className="v12-legal-intro">{doc.intro}</p>}
      {doc.sections.map(([h, body]) => {
        const items = body.split('|');
        return (
          <section key={h}>
            <h4>{h}</h4>
            {items.length > 1
              ? <ul>{items.map(x => <li key={x}><Text s={x} /></li>)}</ul>
              : <p><Text s={body} /></p>}
          </section>
        );
      })}
    </div>
  );
}

export function useLegal() {
  const { language } = useLanguage();
  return legalFor(language);
}

export function PrivacyContent() { return <LegalBody doc={useLegal().privacy} />; }
export function TermsContent() { return <LegalBody doc={useLegal().terms} />; }
