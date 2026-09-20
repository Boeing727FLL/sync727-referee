export const R2_PUBLIC_URL = 'https://pub-9b07ff19511b4468a47d28bb2cb58176.r2.dev';

/** Build a public URL without loading the S3 administration SDK. */
export const getPublicUrl = (key: string) => `${R2_PUBLIC_URL}/${key}`;
