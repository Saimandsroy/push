'use client';

import { useRef, useState } from 'react';
import { FileObject } from '@/lib/types';
import { useSessionManager } from '@/hooks/useSessionManager';
import { usePricing } from '@/hooks/usePricing';
import { Header } from '@/components/Header';
import { StatusBar } from '@/components/StatusBar';
import { PricingDisplay } from '@/components/PricingDisplay';
import { FileUpload, FileUploadHandle } from '@/components/FileUpload';
import { OrderSummary } from '@/components/OrderSummary';
import { CheckoutModal } from '@/components/CheckoutModal';
import { OrderSuccessBanner } from '@/components/OrderSuccessBanner';
import { StatusMonitor } from '@/components/StatusMonitor';
import { GlobalErrorHandler } from '@/components/GlobalErrorHandler';
import { BootLoader } from '@/components/BootLoader';
import { Footer } from '@/components/Footer';

export default function Home() {
  const [files, setFiles] = useState<FileObject[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [orderResult, setOrderResult] = useState<{orderId: string, paymentMethod: 'cash' | 'online' | ''}>({orderId: '', paymentMethod: ''});
  
  const { session, sessionId, customerUUID, loading: sessionLoading } = useSessionManager();
  const { pricing, loading: pricingLoading } = usePricing();

  const handleFilesChange = (newFiles: FileObject[]) => {
    setFiles(newFiles);
  };

  const fileUploadRef = useRef<FileUploadHandle>(null);

  // Trigger uploads from OrderSummary button; opening checkout happens on upload completion
  const handleCheckout = () => {
    if (files.length === 0) return;
    fileUploadRef.current?.startUpload();
  };

  const handleCheckoutSuccess = (orderId: string, paymentMethod: string) => {
    const mapped: 'cash' | 'online' = paymentMethod === 'cash' ? 'cash' : 'online';
    setOrderResult({ orderId, paymentMethod: mapped });
    setShowCheckout(false);
    setShowSuccess(true);
    // Reset internal FileUpload state so previous selection does not persist
    fileUploadRef.current?.reset();
    setFiles([]);
  };

  const handleSuccessClose = () => {
    setShowSuccess(false);
    // Clear files after successful order
    setFiles([]);
  };

  const handleCheckStatus = () => {
    if (sessionId) {
      window.open(`/status?sessionId=${sessionId}`, '_blank');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 text-gray-900">
      <GlobalErrorHandler />
      <BootLoader active={sessionLoading || pricingLoading} sessionLoading={sessionLoading} pricingLoading={pricingLoading} />
      <Header />
      <StatusBar />
      
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <StatusMonitor sessionId={sessionId} />
        
        {/* Welcome Banner */}
        <div className="text-center mb-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Welcome to Prane Printing Shop</h2>
          <p className="text-gray-600 text-lg">Fast, Reliable, and Affordable Printing Services</p>
        </div>
        
        {/* Pricing Section */}
        {pricing && <PricingDisplay pricing={pricing} />}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Upload Section */}
          <div className="lg:col-span-2 space-y-6">
            <FileUpload 
              ref={fileUploadRef}
              onFilesChange={handleFilesChange} 
              onProceedToCheckout={() => setShowCheckout(true)}
            />
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <OrderSummary files={files} onCheckout={handleCheckout} disabled={!sessionId || !customerUUID || sessionLoading} />
          </div>
        </div>

        {/* Action Buttons moved to Header */}

        {/* Features Section */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center p-6 bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow">
            <div className="text-4xl mb-4">🚀</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Fast Processing</h3>
            <p className="text-gray-600">Quick file upload and processing with real-time page detection</p>
          </div>
        </div>
      </main>

      <Footer />

      {showCheckout && sessionId && customerUUID && (
        <CheckoutModal
          files={files}
          sessionId={sessionId}
          customerUUID={customerUUID}
          onClose={() => setShowCheckout(false)}
          onSuccess={(orderId, paymentMethod) => {
            const mapped: 'cash' | 'online' = paymentMethod === 'cash' ? 'cash' : 'online';
            setOrderResult({orderId, paymentMethod: mapped});
            setShowCheckout(false);
            setShowSuccess(true);
            // Ensure FileUpload clears its internal state immediately after success
            fileUploadRef.current?.reset();
            setFiles([]);
          }}
        />
      )}

      {showSuccess && (
        <OrderSuccessBanner
          orderId={orderResult.orderId}
          paymentMethod={(orderResult.paymentMethod === 'cash' ? 'cash' : 'online')}
          sessionId={sessionId || ''}
          onClose={() => {
            setShowSuccess(false);
            // Clear both parent and internal uploader states on close
            setFiles([]);
            fileUploadRef.current?.reset();
          }}
        />
      )}
    </div>
  );
}
