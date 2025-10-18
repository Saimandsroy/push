import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function generateSessionId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function parsePageRange(pageRange: string, totalPages: number, selectionType: string): number[] {
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

export function calculatePrice(
  paperSize: string, 
  colorMode: string, 
  pages: number, 
  copies: number, 
  pricing: any
): number {
  const priceKey = `${paperSize.toLowerCase()}_${colorMode}`;
  const pricePerPage = pricing[priceKey] || 2.00;
  return pages * copies * pricePerPage;
}

export function formatCurrency(amount: number): string {
  return `₹${amount.toFixed(2)}`;
}
