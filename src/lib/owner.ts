import { auth } from './firebase';

export const OWNER_EMAIL = 'boeing727.il@gmail.com';

export function isOwnerEmail(email?: string | null): boolean {
  return (email || '').trim().toLowerCase() === OWNER_EMAIL;
}

// The signed-in user's email, from Firebase Auth first,
// falling back to the saved auth_user from the login page.
export function getCurrentEmail(): string {
  try {
    const fbEmail = auth.currentUser?.email;
    if (fbEmail) return fbEmail;
  } catch {
    return '';
  }
  try {
    const raw = localStorage.getItem('auth_user');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.email) return String(parsed.email);
    }
  } catch {
    return '';
  }
  return '';
}

export function isCurrentUserOwner(): boolean {
  return isOwnerEmail(getCurrentEmail());
}
