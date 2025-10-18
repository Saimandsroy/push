export interface FileObject {
  id: string;
  file: File;
  name: string;
  size: number;
  pages: number;
  copies: number;
  paperSize: 'A4' | 'A3';
  colorMode: 'bw' | 'color';
  pageSelection: 'all' | 'range' | 'specific';
  pageRange: string;
  selectedPages: number[];
  status: 'processing' | 'ready' | 'error' | 'uploaded';
  r2Url?: string;
  r2Key?: string;
  backendFileId?: string; // ID returned by backend /customer/upload endpoint
}

export interface PricingConfig {
  a4_bw: number;
  a4_color: number;
  a3_bw?: number;
  a3_color?: number;
}

export interface SessionData {
  sessionId: string;
  customerUUID: string;
  createdAt: string;
}

export interface OrderData {
  orderId: string;
  sessionId: string;
  customerUUID: string;
  customerName: string;
  files: FileObject[];
  totalAmount: number;
  paymentMethod: 'razorpay' | 'cash';
  paymentStatus: 'pending' | 'completed' | 'failed';
  status: 'pending' | 'confirmed' | 'printing' | 'completed' | 'ready_for_pickup';
  createdAt: string;
}

export interface ShopStatus {
  isOpen: boolean;
  message?: string;
  queueLength?: number;
}
