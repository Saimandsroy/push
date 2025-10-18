import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  try {
    // Use explicit HTTPS and the v4 ESM worker path hosted on unpkg
    // This avoids protocol-relative URLs and 404s for versions not mirrored on cdnjs
    // Example: https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs
    // @ts-ignore
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  } catch {}
}

export async function detectPdfPages(file: File): Promise<number> {
  try {
    // Read file as ArrayBuffer
    const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target?.result as ArrayBuffer);
      reader.onerror = () => reject(new Error('Failed to read PDF file'));
      reader.readAsArrayBuffer(file);
    });

    // Try PDF.js detection first (most accurate)
    try {
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      if (pdf && typeof pdf.numPages === 'number' && pdf.numPages > 0) {
        return pdf.numPages;
      }
    } catch (err) {
      console.warn('PDF.js detection failed, falling back to regex method:', err);
    }

    // Fallback: heuristic detection using text patterns
    const uint8Array = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder('latin1');
    const scanLength = Math.min(uint8Array.length, 500000); // scan up to 500KB
    const binaryString = decoder.decode(uint8Array.subarray(0, scanLength));

    // 1) Match /Type /Pages ... /Count N (common in catalog)
    // Use [\s\S]*? instead of dotAll (/s) to support older targets
    const pagesObjectMatch = binaryString.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/);
    if (pagesObjectMatch) {
      const count = parseInt(pagesObjectMatch[1]);
      if (!isNaN(count) && count > 0 && count <= 5000) {
        return count;
      }
    }

    // 2) Count individual page objects
    const pageMatches = binaryString.match(/\b\/Type\s*\/Page\b/g);
    if (pageMatches && pageMatches.length > 0) {
      const pageCount = pageMatches.length;
      if (pageCount > 0 && pageCount <= 5000) {
        return pageCount;
      }
    }

    // 3) Gather all /Count occurrences and take median
    const countMatches = binaryString.match(/\/Count\s+(\d+)/g);
    if (countMatches && countMatches.length > 0) {
      const counts = countMatches
        .map(m => parseInt((m.match(/\d+/)?.[0] ?? '0')))
        .filter(n => !isNaN(n) && n > 0 && n <= 5000)
        .sort((a, b) => a - b);
      if (counts.length > 0) {
        const median = counts[Math.floor(counts.length / 2)];
        return median;
      }
    }

    // Final fallback: estimate by size
    const estimatedPages = Math.max(1, Math.ceil(file.size / 120000));
    return Math.min(estimatedPages, 500);

  } catch (error) {
    console.warn('PDF page detection failed:', error);
    // Simple size-based fallback
    return Math.max(1, Math.min(200, Math.ceil(file.size / 150000)));
  }
}

export function estimatePagesByFileType(file: File): number {
  const extension = file.name.toLowerCase().split('.').pop();
  
  switch (extension) {
    case 'pdf':
      return Math.max(1, Math.ceil(file.size / 100000)); // Fallback for PDF
    case 'doc':
    case 'docx':
      return Math.max(1, Math.ceil(file.size / 50000)); // ~50KB per page
    case 'txt':
      return Math.max(1, Math.ceil(file.size / 3000)); // ~3KB per page for text
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'bmp':
    case 'gif':
    case 'tiff':
    case 'tif':
      return 1; // Images are always 1 page
    default:
      return Math.max(1, Math.ceil(file.size / 50000)); // Default estimation
  }
}
