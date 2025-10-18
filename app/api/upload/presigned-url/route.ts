import '@/lib/edge-polyfill';
import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Client, R2_CONFIG, generateFileKey, getExpirationTime } from '@/lib/r2-config';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    const { fileName, fileType, fileSize } = await request.json();

    if (!fileName || !fileType) {
      return NextResponse.json(
        { error: 'fileName and fileType are required' },
        { status: 400 }
      );
    }

    // Generate unique file key
    const fileKey = generateFileKey(fileName);
    const expirationTime = getExpirationTime();

    // Create the command for uploading to R2
    const command = new PutObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: fileKey,
      ContentType: fileType,
      ContentLength: fileSize,
      Metadata: {
        'original-name': fileName,
        'upload-time': new Date().toISOString(),
        'expires-at': expirationTime.toISOString(),
      },
    });

    // Generate presigned URL (valid for 1 hour)
    const presignedUrl = await getSignedUrl(r2Client, command, {
      expiresIn: 3600, // 1 hour
    });

    // Generate the public URL for accessing the file
    const publicUrl = `${R2_CONFIG.publicUrl}/${fileKey}`;

    return NextResponse.json({
      success: true,
      presignedUrl,
      fileKey,
      publicUrl,
      expiresAt: expirationTime.toISOString(),
    });

  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate presigned URL' },
      { status: 500 }
    );
  }
}
