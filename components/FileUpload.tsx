'use client';

import { useCallback, useImperativeHandle, useState, forwardRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X, AlertCircle, CheckCircle } from 'lucide-react';
import { FileObject } from '@/lib/types';
import { detectPdfPages, estimatePagesByFileType } from '@/lib/pdf-utils';
import { formatFileSize } from '@/lib/utils';
import { fetchWithLoadBalancer, UPLOAD_ENDPOINT } from '@/lib/api';
import * as pdfjsLib from 'pdfjs-dist';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { UploadProgressModal } from './UploadProgressModal';
import { useSessionManager } from '@/hooks/useSessionManager';
import { usePricing } from '@/hooks/usePricing';

// Public Cloudflare R2 base for accessing files
const PUBLIC_R2_BASE = 'https://pub-6f63e5e6ecb749e1a0a18c2525616d92.r2.dev/uploads/';

function buildPublicUrl(fileKey: string): string {
  // Remove any leading domain/path that might be included in fileKey
  try {
    // If fileKey is accidentally a full URL, take only the pathname
    if (fileKey.startsWith('http')) {
      const u = new URL(fileKey);
      fileKey = u.pathname.replace(/^\//, '');
    }
  } catch {}
  // Normalize: remove leading 'uploads/' and leading slashes
  fileKey = fileKey.replace(/^\/?uploads\//, '').replace(/^\//, '');
  return `${PUBLIC_R2_BASE}${fileKey}`;
}

interface FileUploadProps {
  onFilesChange: (files: FileObject[]) => void;
  maxFileSize?: number;
  allowedTypes?: string[];
  onProceedToCheckout?: () => void;
}

interface UploadProgressItem {
  id: string;
  fileName: string;
  progress: number;
  status: 'uploading' | 'registering' | 'completed' | 'error';
  error?: string;
}

interface FileItemProps {
  file: FileObject;
  onUpdate: (updates: Partial<FileObject>) => void;
  onRemove: () => void;
  a3Supported?: boolean;
}

export type FileUploadHandle = {
  startUpload: () => Promise<void>;
  reset: () => void;
};

export const FileUpload = forwardRef<FileUploadHandle, FileUploadProps>(function FileUpload({ 
  onFilesChange, 
  maxFileSize = 50 * 1024 * 1024, // 50MB
  allowedTypes = ['.pdf', '.jpg', '.jpeg', '.png', '.bmp', '.gif', '.tiff'],
  onProceedToCheckout
}: FileUploadProps, ref) {
  const [files, setFiles] = useState<FileObject[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const { sessionId, customerUUID } = useSessionManager();
  const { pricing, calculatePrice } = usePricing();
  
  // Check if A3 is supported based on backend pricing
  const a3Supported = !!(pricing?.a3_bw && pricing?.a3_color);

  // Configure PDF.js worker (client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        // Only set if not already configured
        // @ts-ignore
        if (!pdfjsLib.GlobalWorkerOptions?.workerSrc) {
          // @ts-ignore
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${String(pdfjsLib.version)}/build/pdf.worker.min.mjs`;
        }
      } catch {}
    }
  }, []);

  // After R2 upload, register the file with backend so it can be used to create orders
  const registerFileWithBackend = async (fileObj: FileObject, publicUrl: string): Promise<string> => {
    console.log(`[Upload] Starting registration for ${fileObj.name} (${fileObj.id})`);
    if (!sessionId || !customerUUID) {
      throw new Error('Missing session. Please refresh the page and try again.');
    }

    // Set status to registering
    setUploadProgress(prev => prev.map(item => item.id === fileObj.id ? { ...item, status: 'registering' } : item));

    // Normalize fileUrl scheme (guard against 'https:/')
    let normalizedUrl = publicUrl;
    if (normalizedUrl.startsWith('https:/') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = normalizedUrl.replace('https:/', 'https://');
    }
    if (normalizedUrl.startsWith('http:/') && !normalizedUrl.startsWith('http://')) {
      normalizedUrl = normalizedUrl.replace('http:/', 'http://');
    }

    // Minimal FormData first (matches backend binder reliably) + required metadata
    const form = new FormData();
    form.append('fileUrl', normalizedUrl);
    form.append('sessionId', sessionId);
    form.append('customerUUID', customerUUID);
    form.append('copies', String(fileObj.copies ?? 1));
    form.append('paperSize', String(fileObj.paperSize ?? 'A4'));
    form.append('colorMode', String(fileObj.colorMode ?? 'bw'));
    form.append('totalPages', String(fileObj.pages ?? 1));
    form.append('pageSelection', String(fileObj.pageSelection ?? 'all'));
    form.append('pageRange', String(fileObj.pageRange ?? ''));
    form.append('selectedPages', JSON.stringify(fileObj.selectedPages ?? []));

    let resp = await fetchWithLoadBalancer('/customer/upload', { method: 'POST', body: form });

    // If server complains about request body data rate, retry with JSON
    if (!resp.ok) {
      let text = '';
      try { text = await resp.text(); } catch {}
      if (resp.status === 400 && text.includes('MinRequestBodyDataRate')) {
        const jsonPayload = {
          fileUrl: normalizedUrl,
          sessionId,
          customerUUID,
          copies: Number(fileObj.copies ?? 1),
          paperSize: String(fileObj.paperSize ?? 'A4'),
          colorMode: String(fileObj.colorMode ?? 'bw'),
          totalPages: Number(fileObj.pages ?? 1),
          pageSelection: String(fileObj.pageSelection ?? 'all'),
          pageRange: String(fileObj.pageRange ?? ''),
          selectedPages: Array.isArray(fileObj.selectedPages) ? fileObj.selectedPages : []
        };
        console.warn('[Upload] FormData timed out; retrying with JSON payload');
        resp = await fetchWithLoadBalancer('/customer/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jsonPayload)
        });
      } else {
        // Reconstruct error context for visibility
        throw new Error(`Failed to register file (${resp.status}) ${text}`);
      }
    }

    if (!resp.ok) {
      let serverMsg = '';
      try { serverMsg = (await resp.text())?.slice(0, 300); } catch {}
      // Reflect error in progress UI for this file
      setUploadProgress(prev => prev.map(item => item.id === fileObj.id 
        ? { ...item, status: 'error', error: `Failed to register (${resp.status}) ${serverMsg}` }
        : item
      ));
      throw new Error(`Failed to register file (${resp.status}) ${serverMsg}`);
    }

    const data = await resp.json().catch(() => ({} as any));
    const returnedId =
      data?.fileId ||
      data?.FileId ||
      data?.FileID ||
      data?.id ||
      data?.Id ||
      data?.ID ||
      data?.file?.id ||
      data?.file?.Id ||
      data?.file?.ID;
    console.log('[Upload] Backend register response:', data, '-> resolved fileId =', returnedId);
    if (!returnedId) {
      // Not fatal for UI, but we should inform
      console.warn('Upload registered but no fileId returned by backend. Response:', data);
      // Still mark as completed to allow proceeding, but warn
      setUploadProgress(prev => prev.map(item => item.id === fileObj.id ? { ...item, status: 'completed' } : item));
      return '';
    }

    // Persist backend file id to local file state
    console.log(`[Upload] Setting backendFileId for ${fileObj.name} (${fileObj.id}) = ${returnedId}`);
    updateFile(fileObj.id, { backendFileId: returnedId });
    // Mark file as fully completed (upload + registration)
    setUploadProgress(prev => prev.map(item => item.id === fileObj.id ? { ...item, status: 'completed' } : item));
    return returnedId as string;
  };

  const processFiles = async (newFiles: File[]) => {
    setIsProcessing(true);
    setError('');
    setSuccess('');
    
    const processedFiles: FileObject[] = [];
    
    for (const file of newFiles) {
      try {
        // Check for duplicates
        const isDuplicate = files.some(f => f.name === file.name && f.size === file.size);
        if (isDuplicate) {
          setError(`File ${file.name} is already uploaded.`);
          continue;
        }

        // Validate file size
        if (file.size === 0) {
          setError(`File ${file.name} is empty.`);
          continue;
        }

        if (file.size > maxFileSize) {
          setError(`File ${file.name} is too large. Maximum size is ${formatFileSize(maxFileSize)}.`);
          continue;
        }

        // Validate file type
        const extension = '.' + file.name.split('.').pop()?.toLowerCase();
        if (!allowedTypes.includes(extension) && !file.type.startsWith('image/') && file.type !== 'application/pdf') {
          setError(`File ${file.name} has an unsupported format. Supported formats: PDF and Images (JPG, PNG, GIF, BMP, TIFF).`);
          continue;
        }

        // Create file object
        const fileObj: FileObject = {
          id: (Date.now() + Math.random() + processedFiles.length).toString(),
          file: file,
          name: file.name,
          size: file.size,
          pages: 1,
          copies: 1,
          paperSize: 'A4',
          colorMode: 'bw',
          pageSelection: 'all',
          pageRange: '',
          selectedPages: [],
          status: 'processing',
          r2Url: '', // Will be set after upload
          r2Key: ''  // Will be set after upload
        };

        // Detect pages for PDFs (client-side only)
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          try {
            fileObj.pages = await detectPdfPages(file);
          } catch (fallbackError) {
            console.warn('Client-side PDF detection failed, using estimation:', fallbackError);
            fileObj.pages = estimatePagesByFileType(file);
          }
        } else {
          fileObj.pages = estimatePagesByFileType(file);
        }

        fileObj.status = 'ready';
        processedFiles.push(fileObj);

      } catch (error) {
        console.error('Error processing file:', file.name, error);
        setError(`Error processing ${file.name}: ${error}`);
      }
    }

    const updatedFiles = [...files, ...processedFiles];
    setFiles(updatedFiles);
    onFilesChange(updatedFiles);
    setIsProcessing(false);

    // Show a friendly success message when files are successfully selected
    if (processedFiles.length > 0) {
      const msg = processedFiles.length === 1
        ? 'File successfully selected'
        : `${processedFiles.length} files successfully selected`;
      setSuccess(msg);
      // Auto-hide after 3 seconds
      window.setTimeout(() => setSuccess(''), 3000);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    processFiles(acceptedFiles);
  }, [files]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.tiff']
    },
    maxSize: maxFileSize,
    multiple: true
  });

  const removeFile = (fileId: string) => {
    const updatedFiles = files.filter(f => f.id !== fileId);
    setFiles(updatedFiles);
    onFilesChange(updatedFiles);
  };

  const updateFile = (fileId: string, updates: Partial<FileObject>) => {
    console.log(`[FileUpload] updateFile called for ${fileId}:`, updates);
    setFiles((prev) => {
      const updated = prev.map(f => (f.id === fileId ? { ...f, ...updates } : f));
      console.log(`[FileUpload] Updated files:`, updated.map(f => ({ name: f.name, id: f.id, backendFileId: f.backendFileId })));
      onFilesChange(updated);
      return updated;
    });
  };

  // Upload files to Cloudflare R2
  const uploadToR2 = async (file: File, fileId: string): Promise<{ publicUrl: string; fileKey: string }> => {
    try {
      // Upload to our server route to avoid CORS; server uploads to R2
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(prev =>
              prev.map(item =>
                item.id === fileId
                  ? { ...item, progress }
                  : item
              )
            );
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            try {
              const resp = JSON.parse(xhr.responseText || '{}');
              const { publicUrl, fileKey } = resp;
              if (!publicUrl || !fileKey) {
                throw new Error('Invalid server response');
              }
              setUploadProgress(prev =>
                prev.map(item =>
                  item.id === fileId
                    ? { ...item, progress: 100, status: 'uploading' }
                    : item
                )
              );
              resolve({ publicUrl, fileKey });
            } catch (e: any) {
              setUploadProgress(prev =>
                prev.map(item =>
                  item.id === fileId
                    ? { ...item, status: 'error', error: e?.message || 'Upload failed' }
                    : item
                )
              );
              reject(e);
            }
          } else {
            setUploadProgress(prev =>
              prev.map(item =>
                item.id === fileId
                  ? { ...item, status: 'error', error: `Upload failed: ${xhr.status}` }
                  : item
              )
            );
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => {
          setUploadProgress(prev =>
            prev.map(item =>
              item.id === fileId
                ? { ...item, status: 'error', error: 'Upload failed' }
                : item
            )
          );
          reject(new Error('Upload failed'));
        });

        const formData = new FormData();
        formData.append('file', file);
        formData.append('fileName', file.name);
        formData.append('contentType', file.type || 'application/octet-stream');

        xhr.open('POST', UPLOAD_ENDPOINT);
        xhr.send(formData);
      });
    } catch (error) {
      setUploadProgress(prev =>
        prev.map(item =>
          item.id === fileId
            ? { ...item, status: 'error', error: error instanceof Error ? error.message : 'Upload failed' }
            : item
        )
      );
      throw error;
    }
  };

  // Handle proceed to checkout (upload all files first)
  const handleProceedToCheckout = async () => {
    if (files.length === 0) {
      setError('Please upload at least one file before proceeding.');
      return;
    }

    setIsUploading(true);
    setShowUploadProgress(true);
    setError('');

    // Initialize upload progress for all files
    const initialProgress: UploadProgressItem[] = files.map(file => ({
      id: file.id,
      fileName: file.name,
      progress: 0,
      status: 'uploading' as const,
    }));
    setUploadProgress(initialProgress);

    try {
      // Upload all files to R2
      const uploadPromises = files.map(async (fileObj) => {
        try {
          const { publicUrl, fileKey } = await uploadToR2(fileObj.file, fileObj.id);
          // Prefer server-provided public URL; fallback to building from key
          const cdnUrl = publicUrl || buildPublicUrl(fileKey);
          
          // Update file object with R2 URLs
          updateFile(fileObj.id, {
            r2Url: cdnUrl,
            r2Key: fileKey,
            status: 'uploaded'
          });
          // Register file with backend immediately after successful R2 upload
          await registerFileWithBackend({ ...fileObj, r2Url: cdnUrl, r2Key: fileKey }, cdnUrl);
          
          return { success: true, fileId: fileObj.id };
        } catch (error) {
          console.error(`Failed to upload ${fileObj.name}:`, error);
          // Ensure the progress row reflects error
          setUploadProgress(prev => prev.map(item => item.id === fileObj.id ? { ...item, status: 'error', error: error instanceof Error ? error.message : 'Upload failed' } : item));
          return { success: false, fileId: fileObj.id, error };
        }
      });

      await Promise.all(uploadPromises);
      
    } catch (error) {
      console.error('Upload process failed:', error);
      setError('Failed to upload files. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  // Expose startUpload to parent
  useImperativeHandle(ref, () => ({
    startUpload: handleProceedToCheckout,
    reset: () => {
      setFiles([]);
      onFilesChange([]);
      setError('');
      setUploadProgress([]);
      setShowUploadProgress(false);
      setIsProcessing(false);
      setIsUploading(false);
    }
  }));

  const handleUploadComplete = () => {
    setShowUploadProgress(false);
    if (onProceedToCheckout) {
      onProceedToCheckout();
    }
  };

  // Retry a failed upload or registration by item id
  const handleRetryUpload = async (id: string) => {
    const f = files.find(x => x.id === id);
    if (!f) return;

    // Clear previous error in modal row
    setUploadProgress(prev => prev.map(item => item.id === id ? { ...item, error: undefined } : item));

    try {
      // If file already has r2Url and r2Key, only retry registering with backend
      if (f.r2Url && f.r2Key) {
        setUploadProgress(prev => prev.map(item => item.id === id ? { ...item, status: 'registering' } : item));
        await registerFileWithBackend(f, f.r2Url);
        // Success path handled inside registerFileWithBackend which marks completed
        return;
      }

      // Otherwise, retry uploading to R2 then register
      setUploadProgress(prev => prev.map(item => item.id === id ? { ...item, status: 'uploading', progress: 0 } : item));
      const { publicUrl, fileKey } = await uploadToR2(f.file, id);
      const cdnUrl = publicUrl || buildPublicUrl(fileKey);
      updateFile(id, { r2Url: cdnUrl, r2Key: fileKey, status: 'uploaded' });
      await registerFileWithBackend({ ...f, r2Url: cdnUrl, r2Key: fileKey }, cdnUrl);
    } catch (error) {
      // Reflect error in row
      setUploadProgress(prev => prev.map(item => item.id === id ? { ...item, status: 'error', error: error instanceof Error ? error.message : 'Retry failed' } : item));
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <Card className={`p-8 border-2 border-dashed transition-colors ${
        isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
      }`}>
        <div {...getRootProps()} className="cursor-pointer text-center">
          <input {...getInputProps()} />
          <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {isDragActive ? 'Drop multiple files here' : 'Upload your documents'}
          </h3>
          <p className="text-gray-600 mb-4">
            Drag and drop multiple files here, or click to select multiple files
          </p>
          <Button variant="outline" disabled={isProcessing}>
            {isProcessing ? 'Processing...' : 'Choose Files'}
          </Button>
          {success && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-green-50 text-green-800 border border-green-200">
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm">{success}</span>
              <button
                type="button"
                onClick={() => setSuccess('')}
                className="ml-1 text-green-700 hover:underline text-xs"
                aria-label="Dismiss success message"
              >
                Dismiss
              </button>
            </div>
          )}
          <p className="text-sm text-gray-500 mt-2">
            Supported formats: PDF and Images (JPG, PNG, GIF, BMP, TIFF). Max size: {formatFileSize(maxFileSize)}
          </p>
        </div>
      </Card>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setError('')}
            className="ml-auto text-red-700 hover:bg-red-100"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Uploaded Files ({files.length})</h3>
          {files.map((fileObj) => (
            <FileItem
              key={fileObj.id}
              file={fileObj}
              onUpdate={(updates: Partial<FileObject>) => updateFile(fileObj.id, updates)}
              onRemove={() => removeFile(fileObj.id)}
              a3Supported={a3Supported}
            />
          ))}
        </div>
      )}

      {/* Upload Progress Modal */}
      <UploadProgressModal
        isOpen={showUploadProgress}
        onClose={() => setShowUploadProgress(false)}
        uploads={uploadProgress}
        onComplete={handleUploadComplete}
        onRetry={handleRetryUpload}
      />
    </div>
  );
});

function FileItem({ file, onUpdate, onRemove, a3Supported = true }: FileItemProps) {
  const isPdf = file.file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const showPageSelection = isPdf && file.pages > 1;

  // Preview state
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewError, setPreviewError] = useState<string>('');

  // Local input state for copies so user can clear and type
  const [copiesInput, setCopiesInput] = useState<string>(String(file.copies ?? 1));
  useEffect(() => {
    // Keep local input in sync if external copies changes
    setCopiesInput(String(file.copies ?? 1));
  }, [file.copies, file.id]);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    async function generatePreview() {
      setPreviewError('');
      try {
        if (!isPdf && file.file.type.startsWith('image/')) {
          objectUrl = URL.createObjectURL(file.file);
          if (!cancelled) setPreviewUrl(objectUrl);
          return;
        }
        if (isPdf) {
          const arrayBuffer = await file.file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 0.3 });
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas context not available');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: ctx as any, viewport }).promise;
          const dataUrl = canvas.toDataURL('image/png');
          if (!cancelled) setPreviewUrl(dataUrl);
          return;
        }
      } catch (e: any) {
        if (!cancelled) setPreviewError(e?.message || 'Preview unavailable');
      }
    }

    generatePreview();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.id, file.file, isPdf]);

  return (
    <Card className="p-6">
      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
        {/* Thumbnail */}
        <div className="w-full sm:w-40 flex-shrink-0">
          <div className="w-full aspect-[3/4] bg-gray-100 border border-gray-200 rounded-lg overflow-hidden flex items-center justify-center">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt={file.name} className="w-full h-full object-contain" />
            ) : (
              <File className="h-10 w-10 text-gray-400" />
            )}
          </div>
          {previewError && (
            <div className="text-xs text-red-600 mt-1 truncate">{previewError}</div>
          )}
        </div>

        {/* File Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <File className="h-5 w-5 text-blue-600 flex-shrink-0" />
            <h4 className="font-semibold text-gray-900 truncate">{file.name}</h4>
            {file.status === 'processing' && (
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          <p className="text-sm text-gray-600 mb-3">
            Size: {formatFileSize(file.size)} | Total Pages: {file.pages}
          </p>

          {/* Page Selection for PDFs */}
          {showPageSelection && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <label className="font-medium text-gray-900">Pages to Print:</label>
                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">
                  {file.pages} total
                </span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                <Button
                  variant={file.pageSelection === 'all' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => onUpdate({ pageSelection: 'all', pageRange: '', selectedPages: [] })}
                  className="justify-start"
                >
                  All Pages ({file.pages})
                </Button>
                <Button
                  variant={file.pageSelection === 'range' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => onUpdate({ pageSelection: 'range', pageRange: '', selectedPages: [] })}
                  className="justify-start"
                >
                  Page Range
                </Button>
                <Button
                  variant={file.pageSelection === 'specific' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => onUpdate({ pageSelection: 'specific', pageRange: '', selectedPages: [] })}
                  className="justify-start"
                >
                  Specific Pages
                </Button>
              </div>

              {file.pageSelection !== 'all' && (
                <input
                  type="text"
                  placeholder={file.pageSelection === 'range' ? 'e.g., 1-5' : 'e.g., 1,3,5'}
                  value={file.pageRange}
                  onChange={(e) => {
                    const pageRange = e.target.value;
                    const selectedPages = parsePageRange(pageRange, file.pages, file.pageSelection);
                    onUpdate({ pageRange, selectedPages });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              )}

              {file.pageSelection !== 'all' && file.selectedPages.length > 0 && (
                <p className="text-sm text-green-700 mt-2">
                  ✓ Will print: {file.selectedPages.length} pages
                </p>
              )}
            </div>
          )}
        </div>

        {/* Options */}
        <div className="flex flex-col sm:flex-row lg:flex-col gap-4 lg:w-64">
          <div className="grid grid-cols-2 sm:grid-cols-1 gap-3">
            {/* Copies */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Copies</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                min="1"
                max="100"
                value={copiesInput}
                placeholder="1"
                onChange={(e) => {
                  const val = e.target.value;
                  // Allow empty for editing
                  if (val === '') {
                    setCopiesInput('');
                    return;
                  }
                  // Only accept up to 3 digits
                  if (/^\d{1,3}$/.test(val)) {
                    setCopiesInput(val);
                    const num = Math.max(1, Math.min(100, parseInt(val, 10)));
                    onUpdate({ copies: num });
                  }
                }}
                onBlur={() => {
                  const num = copiesInput === '' ? 1 : Math.max(1, Math.min(100, parseInt(copiesInput, 10) || 1));
                  setCopiesInput(String(num));
                  onUpdate({ copies: num });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Paper Size */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Paper Size</label>
              <select
                value={file.paperSize}
                onChange={(e) => onUpdate({ paperSize: e.target.value as 'A4' | 'A3' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="A4">A4 (210×297mm)</option>
                {a3Supported && <option value="A3">A3 (297×420mm)</option>}
              </select>
            </div>

            {/* Color Mode */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Print Mode</label>
              <select
                value={file.colorMode}
                onChange={(e) => onUpdate({ colorMode: e.target.value as 'bw' | 'color' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="bw">🖤 Black & White</option>
                <option value="color">🌈 Full Color</option>
              </select>
            </div>
          </div>

          {/* Remove Button */}
          <Button
            variant="danger"
            size="sm"
            onClick={onRemove}
            className="self-start"
          >
            <X className="h-4 w-4 mr-1" />
            Remove
          </Button>
        </div>
      </div>
    </Card>
  );
}

function parsePageRange(pageRange: string, totalPages: number, selectionType: string): number[] {
  if (!pageRange || selectionType === 'all') {
    return Array.from({length: totalPages}, (_, i) => i + 1);
  }

  const pages = new Set<number>();
  const parts = pageRange.split(',').map(p => p.trim());

  for (let part of parts) {
    if (part.includes('-') && selectionType === 'range') {
      const [start, end] = part.split('-').map(n => parseInt(n.trim()));
      if (start && end && start <= end && start >= 1 && end <= totalPages) {
        for (let i = start; i <= end; i++) {
          pages.add(i);
        }
      }
    } else {
      const pageNum = parseInt(part);
      if (pageNum && pageNum >= 1 && pageNum <= totalPages) {
        pages.add(pageNum);
      }
    }
  }

  return Array.from(pages).sort((a, b) => a - b);
}
