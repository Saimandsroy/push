import { S3Client } from '@aws-sdk/client-s3';

// Cloudflare R2 configuration via environment variables (server-side only)
// DO NOT expose secrets to the client. Ensure this module is only imported in server code.
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || process.env.NEXT_PUBLIC_R2_ACCOUNT_ID || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'printing';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_PUBLIC_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}`;

export const R2_CONFIG = {
  accountId: R2_ACCOUNT_ID,
  bucketName: R2_BUCKET_NAME,
  accessKeyId: R2_ACCESS_KEY_ID,
  secretAccessKey: R2_SECRET_ACCESS_KEY,
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: 'auto' as const, // Cloudflare R2 uses 'auto' as region
  publicUrl: R2_PUBLIC_BASE,
};

// Create S3 client configured for Cloudflare R2
export const r2Client = new S3Client({
  region: R2_CONFIG.region,
  endpoint: R2_CONFIG.endpoint,
  credentials: {
    accessKeyId: R2_CONFIG.accessKeyId,
    secretAccessKey: R2_CONFIG.secretAccessKey,
  },
  forcePathStyle: true, // Required for R2
});

// Generate a unique file key with auto-deletion timestamp
export function generateFileKey(originalName: string): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 15);
  const extension = originalName.split('.').pop();
  const baseName = originalName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9]/g, '_');
  
  return `uploads/${timestamp}_${randomId}_${baseName}.${extension}`;
}

// Generate public URL for uploaded file
export function getPublicFileUrl(fileKey: string): string {
  return `${R2_CONFIG.publicUrl}/${fileKey}`;
}

// Calculate expiration time (30 minutes from now)
export function getExpirationTime(): Date {
  return new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
}
