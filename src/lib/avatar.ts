/**
 * Avatar helpers for email+password logins, which carry no Google photo.
 * Falls back to the account's Gravatar: SHA-256 of the normalized email
 * (Gravatar supports SHA-256, so no MD5 dependency is needed). `d=404`
 * makes Gravatar answer 404 when no avatar exists, so callers can probe
 * with an Image and keep the initial-letter fallback on failure.
 */
export async function gravatarUrlForEmail(email: string): Promise<string | null> {
  try {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) return null;
    if (!crypto?.subtle) return null;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
    const hash = Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return `https://www.gravatar.com/avatar/${hash}?s=96&d=404`;
  } catch {
    return null;
  }
}

/** Resolve with the URL only if an avatar actually exists (else null). */
export function probeImage(url: string): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    } catch {
      resolve(false);
    }
  });
}
