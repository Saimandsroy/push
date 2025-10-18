import '@/lib/edge-polyfill';
import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_CONFIG, generateFileKey, getExpirationTime } from '@/lib/r2-config';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    const fileName = form.get('fileName') as string | null;
    const contentType = form.get('contentType') as string | null;

    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const originalName = fileName || 'upload.bin';
    const fileKey = generateFileKey(originalName);
    const expiresAt = getExpirationTime();

    const command = new PutObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: fileKey,
      // Pass Blob directly in Edge runtime
      Body: file,
      ContentType: contentType || (file as Blob).type || 'application/octet-stream',
      Metadata: {
        'original-name': originalName,
        'upload-time': new Date().toISOString(),
        'expires-at': expiresAt.toISOString(),
      },
    });

    await r2Client.send(command);

    const publicUrl = `${R2_CONFIG.publicUrl}/${fileKey}`;

    return NextResponse.json({
      success: true,
      fileKey,
      publicUrl,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error('Direct upload error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

