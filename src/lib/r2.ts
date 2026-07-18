import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const R2_ACCOUNT_ID = '2d106fb460c2e5c4df4201020f56d44a';
const R2_ACCESS_KEY_ID = 'f8a791f79723a888ed6f627144b6f3e0';
const R2_SECRET_ACCESS_KEY = '54aecdc9c5ad3ef6c83a73acd772558b551115ad916d2f3f13d99d7c51711fc0';
export const R2_BUCKET_NAME = 'sync727';
export const R2_PUBLIC_URL = 'https://pub-9b07ff19511b4468a47d28bb2cb58176.r2.dev';

export const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export const getPublicUrl = (key: string) => {
  return `${R2_PUBLIC_URL}/${key}`;
};

export const deleteFileFromR2 = async (publicUrl: string) => {
  if (!publicUrl) return;
  let key = '';
  if (publicUrl.startsWith(R2_PUBLIC_URL)) {
    key = publicUrl.replace(`${R2_PUBLIC_URL}/`, '');
  } else if (publicUrl.includes('/api/r2/file/')) {
    key = publicUrl.substring(publicUrl.indexOf('/api/r2/file/') + '/api/r2/file/'.length);
  } else {
    // Relative key or unknown format
    key = publicUrl;
  }
  
  try {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    }));
  } catch (error) {
    console.error('Error deleting file from R2:', error);
  }
};
