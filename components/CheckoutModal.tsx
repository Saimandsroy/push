'use client';

import { useState, useEffect } from 'react';
import { X, CreditCard, Banknote, User } from 'lucide-react';
import { FileObject } from '@/lib/types';
import { fetchWithLoadBalancer, TimeoutError } from '@/lib/api';
import { usePricing } from '@/hooks/usePricing';
import { formatCurrency } from '@/lib/utils';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

interface CheckoutModalProps {
  files: FileObject[];
  sessionId: string;
  customerUUID: string;
  onClose: () => void;
  onSuccess: (orderId: string, paymentMethod: string) => void;
}

const CUSTOMER_NAME_KEY = 'printshop_customer_name';

export function CheckoutModal({ files, sessionId, customerUUID, onClose, onSuccess }: CheckoutModalProps) {
  const [customerName, setCustomerName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [showRetry, setShowRetry] = useState(false);
  const [lastAttempt, setLastAttempt] = useState<{ type: 'order' | 'payment'; data: any } | null>(null);
  const { calculatePrice } = usePricing();
  const isOnlinePaymentEnabled = String(process.env.NEXT_PUBLIC_IS_ONLINE_PAYMENT ?? 'true').toLowerCase() === 'true';

  // Load customer name from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CUSTOMER_NAME_KEY);
      if (stored) setCustomerName(stored);
    } catch {}
  }, []);

  // Save customer name to localStorage whenever it changes
  const updateCustomerName = (name: string) => {
    setCustomerName(name);
    try {
      if (name.trim()) localStorage.setItem(CUSTOMER_NAME_KEY, name.trim());
    } catch {}
  };

  const calculateTotal = () => {
    return files.reduce((total, file) => {
      const pagesToPrint = file.pageSelection === 'all' ? file.pages : file.selectedPages.length;
      const isPdf = file.file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      return total + calculatePrice(
        file.paperSize,
        file.colorMode,
        pagesToPrint,
        file.copies,
        file.paperType || 'normal',
        Boolean(file.duplex && isPdf)
      );
    }, 0);
  };

  const totalPages = files.reduce((sum, file) => {
    const pagesToPrint = file.pageSelection === 'all' ? file.pages : file.selectedPages.length;
    return sum + (pagesToPrint * file.copies);
  }, 0);

  const totalAmount = calculateTotal();

  // Derived: which files are not yet registered with backend (no backendFileId)
  const unregisteredFiles = files.filter(f => !f.backendFileId || String(f.backendFileId).trim().length === 0);
  const allFilesRegistered = unregisteredFiles.length === 0;

  // Debug logging for file registration status
  useEffect(() => {
    console.log('[CheckoutModal] Files registration status:');
    files.forEach(f => {
      console.log(`  - ${f.name}: backendFileId = ${f.backendFileId || 'MISSING'}`);
    });
    console.log(`[CheckoutModal] All files registered: ${allFilesRegistered}`);
  }, [files, allFilesRegistered]);

  function loadRazorpay(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') return reject(new Error('Window not available'));
      if ((window as any).Razorpay) return resolve();
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Razorpay'));
      document.body.appendChild(script);
    });
  }

  const handlePaymentMethod = async (method: 'online' | 'cash') => {
    if (!customerName.trim()) {
      setError('Please enter your name to continue.');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      // Build FileIds from files registered via /customer/upload
      const fileIdsRaw = files
        .map(f => f.backendFileId)
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);

      // Ensure all files are registered
      if (fileIdsRaw.length === 0) {
        throw new Error('No uploaded files registered. Please upload files again.');
      }
      if (fileIdsRaw.length !== files.length) {
        const pendingNames = unregisteredFiles.map(f => f.name).join(', ');
        throw new Error(
          pendingNames
            ? `These files are still registering: ${pendingNames}. Please wait a moment and try again.`
            : 'Some files are not registered yet. Please wait until all files finish registering and try again.'
        );
      }

      // Dedupe in case of any accidental duplicates
      const fileIds = Array.from(new Set(fileIdsRaw));

      // Create order with explicit FileIds
      const createResp = await fetchWithLoadBalancer('/order/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          CustomerUUID: customerUUID,
          CustomerName: customerName.trim(),
          PaymentMethod: method === 'online' ? 'razorpay' : 'cash',
          FileIds: fileIds
        })
      }, { timeoutMs: 40_000 });
      if (!createResp.ok) {
        // Try to surface server error details
        const errText = await createResp.text();
        try {
          const errJson = JSON.parse(errText);
          throw new Error(errJson.error || errJson.message || `Failed to create order (${createResp.status})`);
        } catch {
          throw new Error(errText || `Failed to create order (${createResp.status})`);
        }
      }
      const orderData = await createResp.json();
      if (!orderData.success) throw new Error(orderData.error || 'Order creation failed');

      const orderId: string = orderData.orderId;

      if (method === 'cash') {
        // Cash: inform parent to show success and close modal
        setIsProcessing(false);
        onSuccess(orderId, 'cash');
        return;
      }

      // 3) Online payment via Razorpay
      await loadRazorpay();
      const RazorpayCtor = (window as any).Razorpay;
      if (!RazorpayCtor) throw new Error('Razorpay unavailable');

      const options = {
        key: orderData.razorpayKeyId,
        amount: Math.round(orderData.totalAmount * 100),
        currency: 'INR',
        name: 'Print Shop',
        description: `Order ${orderId}`,
        order_id: orderData.razorpayOrderId,
        handler: async (response: any) => {
          try {
            // Verify payment with enhanced payload matching previous implementation
            const verifyPayload = {
              OrderId: orderId,
              PaymentId: orderData.paymentId,
              RazorpayOrderId: response.razorpay_order_id,
              RazorpayPaymentId: response.razorpay_payment_id,
              RazorpaySignature: response.razorpay_signature,
              // Add stats info for analytics
              IsColor: files.some(f => f.colorMode === 'color'),
              PaperSize: files[0]?.paperSize || 'A4'
            };

            console.log('🔐 Verifying Razorpay payment...', verifyPayload);
            
            const verifyResp = await fetchWithLoadBalancer('/order/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(verifyPayload)
            }, { timeoutMs: 40_000 });
            
            if (!verifyResp.ok) {
              const errText = await verifyResp.text();
              throw new Error(`Payment verification failed: ${errText}`);
            }
            
            const verify = await verifyResp.json();
            console.log('✅ Verify result:', verify);
            
            if (!verify.Success && !verify.success) {
              throw new Error(verify.Error || verify.error || 'Payment verification failed');
            }
            
            setIsProcessing(false);
            onSuccess(orderId, 'online');
          } catch (err: any) {
            console.error('Payment verification error:', err);
            setError(err?.message || 'Payment verification failed');
            setIsProcessing(false);
          }
        },
        theme: { color: '#3399cc' }
      } as any;

      const rzp = new RazorpayCtor(options);
      rzp.open();
    } catch (err: any) {
      console.error('Checkout error:', err);
      const errorMessage = err.message || 'Failed to process checkout';
      setError(errorMessage);
      
      // Show retry button if it's a timeout or network error
      if (err instanceof TimeoutError || err.message?.includes('timeout') || err.message?.includes('network')) {
        setShowRetry(true);
        setLastAttempt({ type: 'order', data: { method } });
      }
      
      setIsProcessing(false);
    }
  };

  const handleRetry = async () => {
    if (!lastAttempt) return;
    
    setError('');
    setShowRetry(false);
    
    if (lastAttempt.type === 'order') {
      // Retry order creation
      await handlePaymentMethod(lastAttempt.data.method);
    }
  };

  // Success banner is shown by parent; this component only handles checkout and payment flows.

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-2xl font-bold text-gray-900">💳 Checkout</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition-colors">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Order Summary */}
          <Card className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50">
            <h3 className="font-bold text-gray-900 mb-3">📋 Order Summary</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total Files:</span>
                <span className="font-semibold text-gray-900">{files.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total Pages:</span>
                <span className="font-semibold text-gray-900">{totalPages}</span>
              </div>
              <div className="flex justify-between text-lg pt-2 border-t border-gray-200">
                <span className="font-bold text-gray-900">Total Amount:</span>
                <span className="font-bold text-blue-600">{formatCurrency(calculateTotal())}</span>
              </div>
            </div>
          </Card>

          {/* Customer Name */}
          <Card className="p-4 bg-gradient-to-r from-gray-50 to-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <User className="h-5 w-5 text-gray-600" />
              <label className="font-semibold text-gray-900">Your Name *</label>
            </div>
            <input
              type="text"
              value={customerName}
              onChange={(e) => {
                updateCustomerName(e.target.value);
                setError('');
              }}
              placeholder="Enter your full name"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            />
            <p className="text-sm text-gray-600 mt-2">Required for all payment methods</p>
          </Card>

          {/* Registration Warning */}
          {!allFilesRegistered && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg">
              <div className="font-semibold mb-1">Please wait… registering files with server</div>
              <div className="text-sm">{unregisteredFiles.map(f => f.name).join(', ')}</div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
              <div className="font-semibold mb-1">⚠️ Error</div>
              <div className="text-sm mb-2">{error}</div>
              {showRetry && (
                <Button
                  onClick={handleRetry}
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                >
                  🔄 Retry
                </Button>
              )}
            </div>
          )}
          {/* Payment Methods */}
          <div className="space-y-4">
            <h3 className="font-bold text-gray-900">💳 Payment Methods</h3>
            
            {/* Online Payment */}
            <button
              onClick={() => { if (isOnlinePaymentEnabled) { void handlePaymentMethod('online'); } }}
              disabled={isProcessing || !allFilesRegistered || !isOnlinePaymentEnabled}
              className="w-full p-4 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-3xl">💳</div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Online Payment</h4>
                    <p className="text-sm text-gray-600">{!isOnlinePaymentEnabled ? 'Coming soon' : (allFilesRegistered ? 'Credit/Debit Card, UPI, Net Banking' : 'Please wait until files finish registering')}</p>
                  </div>
                </div>
                <div className="text-blue-600 font-bold">→</div>
              </div>
              {isOnlinePaymentEnabled ? (
                <div className="flex gap-2 mt-2 ml-16">
                  <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">✓ Instant Payment</span>
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">✓ Secure & Fast</span>
                </div>
              ) : (
                <div className="flex gap-2 mt-2 ml-16">
                  <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs">Coming soon</span>
                </div>
              )}
            </button>

            {/* Cash Payment */}
            <button
              onClick={() => handlePaymentMethod('cash')}
              disabled={isProcessing || !allFilesRegistered}
              className="w-full p-4 border-2 border-gray-200 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-3xl">💵</div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Cash Payment</h4>
                    <p className="text-sm text-gray-600">{allFilesRegistered ? 'Pay when you collect your prints' : 'Please wait until files finish registering'}</p>
                  </div>
                </div>
                <div className="text-green-600 font-bold">→</div>
              </div>
              <div className="flex gap-2 mt-2 ml-16">
                <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs">✓ Pay Later</span>
                <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs">✓ No Online Transaction</span>
              </div>
            </button>
          </div>

          {/* Processing Indicator */}
          {isProcessing && (
            <div className="text-center py-4">
              <div className="inline-flex items-center gap-3">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-gray-600">Processing your order...</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
