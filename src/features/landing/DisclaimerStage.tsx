/**
 * DisclaimerStage — the mandatory disclaimer as a landing stage.
 *
 * The whole entry sequence now lives on one page: intro -> (login) ->
 * disclaimer -> entrance -> chat. This stage is the shared
 * MandatoryDisclaimerModal (the intro's fold-in language) fed with the
 * app-locale t(), shown BEFORE the chat entrance — after a fresh login and
 * after a signed-in user presses the continue CTA. On confirm the modal
 * plays its slow exit while the chat surface reveals underneath.
 */

import MandatoryDisclaimerModal from '../../components/MandatoryDisclaimerModal';
import { useLanguage } from '../../hooks/useLanguage';

export default function DisclaimerStage({ isOpen, onConfirm }: { isOpen: boolean; onConfirm: () => void }) {
  const { t } = useLanguage();
  return <MandatoryDisclaimerModal isOpen={isOpen} onConfirm={onConfirm} t={t} />;
}
