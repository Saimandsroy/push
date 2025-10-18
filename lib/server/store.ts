// Simple in-memory store for demo purposes. In production, replace with a database.

export type Pricing = {
  a4_bw: number;
  a4_color: number;
  a3_bw: number;
  a3_color: number;
};

export type UploadedFile = {
  fileId: string;
  sessionId: string;
  customerUUID: string;
  name: string;
  size: number;
  totalPages: number;
  pagesToPrint: number;
  copies: number;
  paperSize: 'A4' | 'A3';
  colorMode: 'bw' | 'color';
  pageSelection: 'all' | 'range' | 'specific';
  pageRange: string;
  selectedPages: number[];
  pricePerPage: number;
  totalPrice: number;
};

export type Order = {
  orderId: string;
  sessionId: string;
  customerUUID: string;
  customerName: string;
  fileIds: string[];
  totalAmount: number;
  paymentMethod: 'razorpay' | 'cash';
  paymentStatus: 'pending' | 'completed' | 'failed';
  status: 'pending' | 'paid' | 'printing' | 'completed' | 'ready_for_pickup';
  createdAt: string;
  completedAt?: string;
  queuePosition?: number;
  razorpayOrderId?: string;
  paymentId?: string;
};

function generateId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export const store = {
  pricing: <Pricing>{
    a4_bw: 2.0,
    a4_color: 8.0,
    a3_bw: 4.0,
    a3_color: 15.0,
  },
  sessions: new Set<string>(), // track customerUUIDs
  files: new Map<string, UploadedFile>(), // fileId -> file
  orders: new Map<string, Order>(), // orderId -> order
  generateId,
};

export function pricePerPageFor(paperSize: 'A4' | 'A3', colorMode: 'bw' | 'color') {
  const key = `${paperSize.toLowerCase()}_${colorMode}` as keyof Pricing;
  return store.pricing[key] ?? 2.0;
}

export function calculateTotal(pages: number, copies: number, paperSize: 'A4' | 'A3', colorMode: 'bw' | 'color') {
  const ppp = pricePerPageFor(paperSize, colorMode);
  return pages * copies * ppp;
}

export function ensureSession(customerUUID: string) {
  if (!customerUUID || typeof customerUUID !== 'string') return false;
  return store.sessions.has(customerUUID);
}

export function createSession() {
  const sessionId = generateId('session');
  const customerUUID = generateId('uuid');
  store.sessions.add(customerUUID);
  return { sessionId, customerUUID };
}
