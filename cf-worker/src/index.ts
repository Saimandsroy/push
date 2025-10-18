// Minimal R2Bucket type to satisfy TypeScript in this isolated worker project
interface R2Bucket {
  put: (key: string, value: ArrayBuffer | ReadableStream | string | Blob, options?: any) => Promise<any>;
}

export interface Env {
  BUCKET: R2Bucket;
  R2_PUBLIC_BASE: string; // e.g., https://<account>.r2.cloudflarestorage.com/<bucket> or https://<public-hash>.r2.dev
  UPLOAD_PREFIX?: string; // default: uploads/
  EXPIRE_MINUTES?: string; // optional metadata only
}

function cors(headers: Headers, origin: string | null) {
  headers.set('Access-Control-Allow-Origin', origin ?? '*');
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Max-Age', '86400');
}

function okJSON(body: unknown, origin: string | null) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  cors(headers, origin);
  return new Response(JSON.stringify(body), { status: 200, headers });
}

function errJSON(status: number, message: string, origin: string | null) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  cors(headers, origin);
  return new Response(JSON.stringify({ error: message }), { status, headers });
}

function randomKey(length = 16) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function buildKey(prefix: string, fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9_.-]+/g, '_').slice(-64) || 'file.bin';
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}${ts}-${randomKey(8)}-${safeName}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      const headers = new Headers();
      cors(headers, origin);
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname !== '/upload' || request.method !== 'POST') {
      return errJSON(404, 'Not Found', origin);
    }

    try {
      const contentType = request.headers.get('content-type') || '';
      if (!contentType.includes('multipart/form-data')) {
        return errJSON(400, 'Expected multipart/form-data', origin);
      }

      const form = await request.formData();
      const blob = form.get('file');
      const fileName = (form.get('fileName') as string) || 'upload.bin';
      const typeOverride = (form.get('contentType') as string) || undefined;

      if (!(blob instanceof Blob)) {
        return errJSON(400, 'Missing file', origin);
      }

      // Build R2 key with a normalized prefix (no leading slashes, exactly one trailing slash)
      const rawPrefix = env.UPLOAD_PREFIX || 'uploads';
      const prefix = rawPrefix.replace(/^\/+|\/+$/g, '') + '/';
      const objectKey = buildKey(prefix, fileName);

      // Put object into R2
      const arrayBuffer = await blob.arrayBuffer();
      await env.BUCKET.put(objectKey, arrayBuffer, {
        httpMetadata: {
          contentType: typeOverride || blob.type || 'application/octet-stream',
        },
      });

      // Build public URL
      // Normalize base and avoid duplicate segments/slashes
      const pubBase = (env.R2_PUBLIC_BASE || '').replace(/\/+$/g, '');
      let keyForUrl = objectKey.replace(/^\/+/, '');
      const prefixNoSlash = prefix.replace(/\/+$/g, '');
      if (pubBase.endsWith(`/${prefixNoSlash}`) && keyForUrl.startsWith(prefix)) {
        keyForUrl = keyForUrl.slice(prefix.length);
      }
      const publicUrl = pubBase ? `${pubBase}/${keyForUrl}`.replace(/\/+\/+/g, '/') : '';

      return okJSON({
        success: true,
        fileKey: objectKey,
        publicUrl,
      }, origin);
    } catch (e: any) {
      return errJSON(500, e?.message || 'Upload failed', origin);
    }
  }
};
