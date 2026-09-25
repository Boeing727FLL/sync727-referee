/** Empty-chat start (v12): the referee (carried in from the landing),
 *  the personal greeting and the starter questions as glass chips. */
import Referee from '../../v12/Referee';
import { ReplyGlyph } from '../../v12/glyphs';

type Props = {
  greeting: string;
  compact?: boolean;
  questions: string[];
  disabled: boolean;
  onQuestion: (question: string) => void;
  t: (key: string) => string;
};

export default function ChatHero({ greeting, compact, questions, disabled, onQuestion, t }: Props) {
  return (
    <div className={`v12-hello select-none${compact ? ' is-compact' : ''}`}>
      <div className="v12-hello-ref" data-v12-hero-ref style={{ width: compact ? 82 : 96, height: compact ? 122 : 96 }}>
        <Referee size={compact ? 82 : 96} glow float />
      </div>
      {greeting && <h2 style={{ textWrap: 'balance', margin: 0 } as React.CSSProperties}>{greeting}</h2>}
      <p style={compact ? { margin: '2px 0 0' } : undefined}>{t('v12.heroSub')}</p>
      <div className="v12-starters">
        {questions.map((question, index) => (
          <button
            key={index}
            type="button"
            className="v12-chip"
            style={{ animationDelay: `${0.45 + index * 0.08}s` }}
            onClick={() => onQuestion(question)}
            disabled={disabled}
          >
            <ReplyGlyph />{question}
          </button>
        ))}
      </div>
    </div>
  );
}
