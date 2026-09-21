/**
 * EmbeddedReferee — the referee app mounted inside the landing's same-page
 * flow (disclaimer -> entrance -> chat). It carries its own MemoryRouter so
 * hooks like useNavigate have context without touching the real URL, and
 * every navigation the app attempts (logout -> '/', kicked -> '/login',
 * header login) escapes to the landing's stage machine instead: the chat
 * folds back to the intro or the login stage on the same page.
 */

import { MemoryRouter } from 'react-router-dom';
import RefereeApp from '../../pages/RefereeApp';

export default function EmbeddedReferee({ onNavigateOut }: { onNavigateOut: (to: string) => void }) {
  return (
    <MemoryRouter>
      <RefereeApp entryStart="chat" onNavigateOut={onNavigateOut} />
    </MemoryRouter>
  );
}
