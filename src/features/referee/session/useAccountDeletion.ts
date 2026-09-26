/**
 * useAccountDeletion - the deletion dialog's staged machine plus the
 * handler that runs it: password re-authentication, wipe the user doc and
 * RTDB traces, delete the Auth user, then clear local traces and hand the
 * screen reset to the caller via onDeleted.
 */
import { useState } from 'react';
import { EmailAuthProvider, deleteUser, reauthenticateWithCredential } from 'firebase/auth';
import { deleteDoc, doc } from 'firebase/firestore';
import { remove as rtdbRemove, ref as rtdbRef } from 'firebase/database';
import { auth } from '../../../lib/firebase/auth';
import { db } from '../../../lib/firebase/firestore';
import { rtdb } from '../../../lib/firebase/rtdb';
import { removeRefereeUser } from '../../../lib/analytics';
import { useAuth } from '../../../hooks/useAuth';
import {
  type AccountDeletionState,
  initialAccountDeletion,
  clearDeletionError,
  rejectDeletion,
  beginReauth,
  failDeletion,
  beginRemovingData,
  beginDeletingAuth,
  completeDeletion,
} from './accountDeletion';

export default function useAccountDeletion({ t, onDeleted }: { t: (key: string) => string; onDeleted: () => void }) {
  const { logout } = useAuth();
  const [deletion, setDeletion] = useState<AccountDeletionState>(initialAccountDeletion);

  /**
   * Delete the account after password re-authentication: user doc, RTDB
   * traces, then the Auth user itself, then every local trace and a reset
   * to the intro screen.
   */
  const handleDeleteAccount = async () => {
    setDeletion(clearDeletionError);
    const current = auth.currentUser;
    if (!current || !current.email) {
      setDeletion(s => rejectDeletion(s, t('account.errNoUser')));
      return;
    }
    if (!deletion.password) {
      setDeletion(s => rejectDeletion(s, t('account.errNeedPassword')));
      return;
    }
    setDeletion(beginReauth);
    try {
      const cred = EmailAuthProvider.credential(current.email, deletion.password);
      await reauthenticateWithCredential(current, cred);
    } catch {
      setDeletion(s => failDeletion(s, t('account.errWrongPassword')));
      return;
    }
    const uid = current.uid;
    setDeletion(beginRemovingData);
    try {
      await deleteDoc(doc(db, 'users', uid));
    } catch (e) {
      setDeletion(s => failDeletion(s, t('account.errDeleteDocFailed')));
      return;
    }
    // RTDB cleanup must happen BEFORE deleteUser signs us out: afterwards
    // there is no auth left and the server denies these writes, leaving
    // stale session/stats entries behind.
    try {
      await rtdbRemove(rtdbRef(rtdb, `referee/sessions/${uid}`));
    } catch { /* session may not exist */ }
    await removeRefereeUser(uid);
    setDeletion(beginDeletingAuth);
    try {
      await deleteUser(current);
    } catch {
      setDeletion(s => failDeletion(s, t('account.errDeleteFailed')));
      return;
    }
    try { await logout(); } catch { /* ignore */ }
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('user_picture');
    localStorage.removeItem('user_name');
    setDeletion(completeDeletion());
    onDeleted();
  };

  return { deletion, setDeletion, handleDeleteAccount };
}
