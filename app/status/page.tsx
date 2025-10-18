'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  RefreshCw,
  ExternalLink,
  Clock,
  CheckCircle,
  Printer,
  Package,
  AlertTriangle,
  AlertOctagon,
  ThumbsUp
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { fetchWithLoadBalancer } from '@/lib/api';

type DisplayStatus =
  | 'created'
  | 'payment_pending'
  | 'paid'
  | 'approved'
  | 'printing'
  | 'ready_for_pickup'
  | 'completed'
  | 'failed'
  | 'print_failed'
  | 'cancelled'
  | 'expired';

interface OrderItem {
  orderId: string;
  status: DisplayStatus;
  totalAmount: number;
  totalPages: number;
  totalCopies: number;
  createdAt: string;
  isCompleted?: boolean;
  completedAt?: string | null;
  paymentType: 'online' | 'cash';
  queuePosition?: number | null;
}

interface SessionInfo {
  sessionId?: string;
  customerUUID?: string;
  customerName?: string;
  isActive?: boolean;
  totalOrders?: number;
  createdAt?: string;
  lastActivity?: string;
}

interface ShopInfo {
  isOpen: boolean;
  isPrinting: boolean;
  message?: string;
  lastChecked?: string;
}

export default function StatusPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <Header />
        <main className="container mx-auto px-4 py-8 max-w-2xl">
          <Card className="text-center p-8">
            <CardContent>
              <div className="text-6xl mb-4">⏳</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Loading status…</h2>
              <p className="text-gray-600 mb-6">Please wait while we load your session.</p>
            </CardContent>
          </Card>
        </main>
      </div>
    }>
      <StatusContent />
    </Suspense>
  );
}

function StatusContent() {
  const searchParams = useSearchParams();
  // The backend accepts either a sessionId (session_...) or a direct customerUUID in the path
  const customerID = searchParams.get('sessionId') || searchParams.get('customerUUID');
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [shop, setShop] = useState<ShopInfo | null>(null);

  useEffect(() => {
    if (customerID) {
      loadStatus();
      // Auto-refresh disabled per request
      return () => {};
    }
  }, [customerID]);

  const loadStatus = async () => {
    if (!customerID) return;
    
    setIsLoading(true);
    setError('');
    
    try {
      const resp = await fetchWithLoadBalancer(
        `/customer/status/${customerID}`,
        { headers: { 'Cache-Control': 'no-store' } },
        { timeoutMs: 35_000 }
      );
      if (!resp.ok) throw new Error('Failed to load status');
      const data = await resp.json();

      if (data.success) {
        // Session info
        setSession({
          sessionId: data.session?.sessionId ?? data.sessionId,
          customerUUID: data.session?.customerUUID ?? data.customerUUID,
          customerName: data.session?.customerName ?? data.customerName,
          isActive: data.session?.isActive ?? data.isActive,
          totalOrders: data.session?.totalOrders ?? data.totalOrders,
          createdAt: data.session?.createdAt ?? data.createdAt,
          lastActivity: data.session?.lastActivity ?? data.lastActivity,
        });

        // Shop info
        setShop({
          isOpen: !!(data.shop?.isOpen ?? data.isOpen),
          isPrinting: !!(data.shop?.isPrinting ?? data.isPrinting),
          message: data.shop?.message ?? data.message,
          lastChecked: data.shop?.lastChecked ?? data.lastChecked,
        });

        // Orders: consolidate possible shapes from backend
        const onlineArray: any[] =
          data.onlineOrders || data.ordersOnline || data.online || [];
        const cashArray: any[] =
          data.cashOrders || data.ordersCash || data.cash || [];
        const genericArray: any[] = data.orders || [];

        const consolidated = [
          ...onlineArray.map((o: any) => ({ ...o, __paymentType: 'online' })),
          ...cashArray.map((o: any) => ({ ...o, __paymentType: 'cash' })),
          // Generic array may already mix both; try to infer via field or fallback to 'online'
          ...genericArray.map((o: any) => ({ ...o, __paymentType: (o.paymentType || o.PaymentType || 'online').toLowerCase() }))
        ];

        const mapped: OrderItem[] = consolidated.map((o: any) => {
          const paymentType: 'online' | 'cash' =
            (o.__paymentType === 'cash' || (o.paymentType || o.PaymentType)?.toLowerCase() === 'cash')
              ? 'cash'
              : 'online';

          const rawStatus: string = String(o.status ?? o.Status ?? 'created');
          const normalized = rawStatus
            .replace(/\s+/g, '_')
            .replace(/-+/g, '_')
            .toLowerCase();

          // Map various forms to our DisplayStatus union
          const statusMap: Record<string, DisplayStatus> = {
            pending: 'created',
            created: 'created',
            paymentpending: 'payment_pending',
            payment_pending: 'payment_pending',
            paid: 'paid',
            printing: 'printing',
            readyforpickup: 'ready_for_pickup',
            ready_for_pickup: 'ready_for_pickup',
            completed: 'completed',
            failed: 'failed',
            cancelled: 'cancelled',
            approved: 'approved',
            expired: 'expired',
            printfailed: 'print_failed',
            print_failed: 'print_failed',
          };

          const status: DisplayStatus = statusMap[normalized] ?? 'created';

          // Count pages/copies
          const totalPages = Number(o.totalPages ?? o.TotalPages ?? 0);
          const totalCopies = Number(o.totalCopies ?? o.TotalCopies ?? 0);
          const fileCount = Number(o.fileCount ?? o.FileCount ?? (Array.isArray(o.files) ? o.files.length : 0));
          const derivedAmount = Number(o.totalAmount ?? o.TotalAmount ?? 0);

          return {
            orderId: String(o.orderId || o.OrderId || ''),
            status,
            totalAmount: derivedAmount,
            totalPages: totalPages || (o.totalPagesPerFile ? o.totalPagesPerFile.reduce((a: number, b: number) => a + b, 0) : 0) || fileCount, // fallback
            totalCopies: totalCopies || 1,
            createdAt: o.createdAt || o.CreatedAt || new Date().toISOString(),
            isCompleted: !!(o.isCompleted ?? o.IsCompleted),
            completedAt: o.completedAt ?? o.CompletedAt ?? null,
            paymentType,
            queuePosition: (o.queuePosition ?? o.QueuePosition) ?? null,
          };
        });

        // Deduplicate by orderId while preferring richer entries
        const unique = new Map<string, OrderItem>();
        for (const m of mapped) {
          if (!unique.has(m.orderId) || (unique.get(m.orderId)!.paymentType === 'online' && m.paymentType === 'cash')) {
            unique.set(m.orderId, m);
          }
        }

        setOrders(Array.from(unique.values()));
      } else {
        throw new Error(data.message || 'Failed to load status');
      }
    } catch (err) {
      setError('Failed to load order status. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusInfo = (status: DisplayStatus) => {
    switch (status) {
      case 'created':
        return { icon: Clock, text: 'Created', color: 'text-gray-700 bg-gray-100' };
      case 'payment_pending':
        return { icon: Clock, text: 'Payment Pending', color: 'text-yellow-700 bg-yellow-50' };
      case 'paid':
        return { icon: CheckCircle, text: 'Paid', color: 'text-blue-700 bg-blue-50' };
      case 'approved':
        return { icon: ThumbsUp, text: 'Approved', color: 'text-indigo-700 bg-indigo-50' };
      case 'printing':
        return { icon: Printer, text: 'Printing', color: 'text-orange-700 bg-orange-50' };
      case 'ready_for_pickup':
        return { icon: Package, text: 'Ready for Pickup', color: 'text-purple-700 bg-purple-50' };
      case 'completed':
        return { icon: Package, text: 'Completed', color: 'text-green-700 bg-green-50' };
      case 'failed':
        return { icon: AlertOctagon, text: 'Failed', color: 'text-red-700 bg-red-50' };
      case 'print_failed':
        return { icon: AlertOctagon, text: 'Print Failed', color: 'text-red-700 bg-red-50' };
      case 'cancelled':
        return { icon: AlertTriangle, text: 'Cancelled', color: 'text-amber-700 bg-amber-50' };
      case 'expired':
        return { icon: AlertTriangle, text: 'Expired', color: 'text-amber-700 bg-amber-50' };
      default:
        return { icon: Clock, text: 'Unknown', color: 'text-gray-700 bg-gray-100' };
    }
  };

  const getProgressPercentage = (status: DisplayStatus) => {
    switch (status) {
      case 'created': return 10;
      case 'payment_pending': return 25;
      case 'paid': return 40;
      case 'approved': return 55;
      case 'printing': return 75;
      case 'completed':
      case 'ready_for_pickup': return 100;
      default: return 0;
    }
  };

  if (!customerID) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <Header />
        <main className="container mx-auto px-4 py-8 max-w-2xl">
          <Card className="text-center p-8">
            <CardContent>
              <div className="text-6xl mb-4">⚠️</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">No Session ID</h2>
              <p className="text-gray-600 mb-6">Please access this page from the main customer page.</p>
              <Button onClick={() => window.location.href = '/'}>
                Go to Main Page
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <Header />
      
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Session Info */}
        <Card className="mb-8 bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-xl">
          <CardContent className="p-6">
            <div className="text-center">
              <div
                className="mx-auto max-w-full text-xl sm:text-2xl font-bold mb-2 truncate"
                title={customerID || undefined}
              >
                {session?.sessionId || customerID}
              </div>
              <p className="text-blue-100 text-sm">Your printing session ID</p>
            </div>
          </CardContent>
        </Card>

        {/* Queue Position Banner - show prominently if user has orders in queue */}
        {orders.some(o => (o.status === 'approved' || o.status === 'printing') && o.queuePosition != null) && (
          <Card className="mb-6 bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-2xl">
            <CardContent className="p-6">
              <div className="text-center">
                <div className="text-5xl font-black mb-2">
                  #{orders.find(o => (o.status === 'approved' || o.status === 'printing') && o.queuePosition != null)?.queuePosition}
                </div>
                <p className="text-lg font-semibold">Your Position in Print Queue</p>
                <p className="text-sm text-orange-100 mt-1">We'll print your order soon!</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Shop Status + Refresh */}
        {shop && (
          <Card className={`mb-6 ${shop.isOpen ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${shop.isOpen ? 'bg-green-600' : 'bg-red-600'}`} />
                <div className="text-sm">
                  <span className="font-medium mr-2">Shop:</span>
                  {shop.isOpen ? 'Open' : 'Closed'} {shop.isOpen && shop.isPrinting ? '• Printing' : ''}
                </div>
              </div>
              {shop.message && <div className="text-sm text-gray-700">{shop.message}</div>}
              <div className="text-xs text-gray-500">Last checked {shop.lastChecked ? new Date(shop.lastChecked).toLocaleTimeString() : ''}</div>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Order Status</h1>
            <p className="text-gray-600">Track your printing progress in real-time</p>
          </div>
          <div className="flex gap-3">
            <Button 
              onClick={loadStatus} 
              disabled={isLoading}
              variant="secondary"
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Refreshing...' : 'Refresh Status'}
            </Button>
            <Button 
              onClick={() => window.location.href = '/'}
              variant="secondary"
              className="flex items-center gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Place New Order
            </Button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="p-4">
              <div className="text-red-700">{error}</div>
            </CardContent>
          </Card>
        )}

        {/* Orders */}
        {orders.length === 0 && !isLoading ? (
          <Card className="text-center p-8">
            <CardContent>
              <div className="text-6xl mb-4">📋</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">No Orders Found</h2>
              <p className="text-gray-600 mb-6">You haven't placed any orders in this session yet.</p>
              <Button onClick={() => window.location.href = '/'}>
                Place Your First Order
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {orders.map((order) => {
              const statusInfo = getStatusInfo(order.status);
              const StatusIcon = statusInfo.icon;
              const progress = getProgressPercentage(order.status);

              return (
                <Card key={order.orderId} className={`overflow-hidden shadow-lg hover:shadow-2xl transition-shadow ${
                  order.status === 'completed' || order.status === 'ready_for_pickup' 
                    ? 'border-green-200 bg-green-50' 
                    : order.status === 'failed' || order.status === 'print_failed' || order.status === 'cancelled' || order.status === 'expired'
                    ? 'border-red-200 bg-red-50'
                    : order.status === 'printing' || order.status === 'approved'
                    ? 'border-orange-200 bg-orange-50'
                    : order.status === 'paid'
                    ? 'border-blue-200 bg-blue-50'
                    : 'border-gray-200 bg-gray-50'
                }`}>
                  <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <CardTitle className="text-xl text-gray-900">
                        Order #{order.orderId.split('_')[1] || order.orderId}
                      </CardTitle>
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-full ${statusInfo.color}`}>
                        <StatusIcon className="h-4 w-4" />
                        <span className="font-medium">{statusInfo.text}</span>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="p-6">
                    {/* Order Details */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
                      <div className="text-center p-4 bg-blue-50 rounded-lg">
                        <div className="text-2xl font-bold text-blue-700">{order.totalPages}</div>
                        <div className="text-sm text-gray-700 font-medium">Total Pages</div>
                      </div>
                      <div className="text-center p-4 bg-green-50 rounded-lg">
                        <div className="text-2xl font-bold text-green-700">₹{order.totalAmount.toFixed(2)}</div>
                        <div className="text-sm text-gray-700 font-medium">Total Amount</div>
                      </div>
                      <div className="text-center p-4 bg-amber-50 rounded-lg">
                        <div className="text-2xl font-bold text-amber-700">{order.totalCopies}</div>
                        <div className="text-sm text-gray-700 font-medium">Copies</div>
                      </div>
                      <div className="text-center p-4 bg-purple-50 rounded-lg">
                        <div className="text-2xl font-bold text-purple-700">
                          {new Date(order.createdAt).toLocaleTimeString('en-IN', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </div>
                        <div className="text-sm text-gray-700 font-medium">Order Time</div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-6">
                      <div className="flex justify-between text-sm text-gray-800 font-medium mb-2">
                        <span>Progress</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div 
                          className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-500"
                          style={{ width: `${progress}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-xs text-gray-700 font-medium mt-2">
                        <span>Created</span>
                        <span>Payment</span>
                        <span>Approved</span>
                        <span>Printing</span>
                        <span>Ready</span>
                      </div>
                    </div>

                    {/* Queue Position (within order card) */}
                    {(order.status === 'approved' || order.status === 'printing') && order.queuePosition != null && (
                      <div className="bg-gradient-to-r from-orange-50 to-yellow-50 border-2 border-orange-200 p-4 rounded-lg text-center mb-4">
                        <div className="text-4xl font-bold text-orange-600">#{order.queuePosition}</div>
                        <div className="text-sm text-gray-800 font-semibold">Position in Queue</div>
                      </div>
                    )}

                    {/* Ready for Pickup Message */}
                    {(order.status === 'completed' || order.status === 'ready_for_pickup') && (
                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 p-4 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="text-2xl">🎉</div>
                          <div>
                            <div className="font-semibold text-green-800">Great news! Your order is ready for pickup.</div>
                            <div className="text-sm text-green-700">Please visit our shop to collect your printed documents.</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Payment Type */}
                    <div className="mt-6 text-sm text-gray-800">Payment Method: <span className="font-semibold uppercase">{order.paymentType}</span></div>

                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
