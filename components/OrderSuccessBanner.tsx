'use client';

import { useEffect, useState } from 'react';
import { X, CheckCircle, Clock, ExternalLink } from 'lucide-react';
import { Button } from './ui/Button';

interface OrderSuccessBannerProps {
  orderId: string;
  paymentMethod: 'cash' | 'online';
  sessionId?: string;
  onClose: () => void;
  autoCloseDelay?: number; // in seconds, default 5
}

export function OrderSuccessBanner({ 
  orderId, 
  paymentMethod, 
  sessionId, 
  onClose, 
  autoCloseDelay = 5 
}: OrderSuccessBannerProps) {
  const [countdown, setCountdown] = useState(autoCloseDelay);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onClose]);

  const handleCheckStatus = () => {
    if (sessionId) {
      window.open(`/status?sessionId=${sessionId}`, '_blank');
    }
    onClose();
  };

  const statusIcon = paymentMethod === 'cash' ? Clock : CheckCircle;
  const statusText = paymentMethod === 'cash' ? 'Order Submitted!' : 'Order Created!';
  const statusMessage = paymentMethod === 'cash' 
    ? 'Your cash order is awaiting admin approval' 
    : 'Your order has been successfully created';
  const statusColor = paymentMethod === 'cash' ? 'text-orange-600' : 'text-green-600';
  const bgColor = paymentMethod === 'cash' ? 'bg-orange-50' : 'bg-green-50';
  const borderColor = paymentMethod === 'cash' ? 'border-orange-200' : 'border-green-200';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className={`bg-white rounded-2xl max-w-md w-full shadow-2xl border-2 ${borderColor} animate-in slide-in-from-bottom-4 duration-300`}>
        {/* Header */}
        <div className={`${bgColor} p-6 rounded-t-2xl relative`}>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="text-center">
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${bgColor} border-2 ${borderColor} mb-4`}>
              {paymentMethod === 'cash' ? (
                <Clock className={`h-8 w-8 ${statusColor}`} />
              ) : (
                <CheckCircle className={`h-8 w-8 ${statusColor}`} />
              )}
            </div>
            <h2 className={`text-2xl font-bold ${statusColor} mb-2`}>{statusText}</h2>
            <p className="text-gray-600">{statusMessage}</p>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Order Details */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">Order ID:</span>
              <span className="font-mono font-semibold text-gray-900">
                {orderId.split('_')[1] || orderId}
              </span>
            </div>
          </div>

          {/* Status Message */}
          <div className="text-center text-gray-600 text-sm leading-relaxed">
            {paymentMethod === 'cash' ? (
              <>
                Please wait for admin approval or visit the shop directly.
                <br />
                <strong>Payment due on collection.</strong>
              </>
            ) : (
              <>
                Check your order status for updates on printing progress.
                <br />
                <strong>Payment has been processed successfully.</strong>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Button
              onClick={handleCheckStatus}
              disabled={!sessionId}
              className="w-full inline-flex items-center justify-center gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Check Order Status
            </Button>
            
            <Button
              variant="outline"
              onClick={onClose}
              className="w-full"
            >
              Continue Shopping
            </Button>
          </div>

          {/* Auto-close countdown */}
          <div className="text-center text-xs text-gray-500">
            This modal will close automatically in <span className="font-semibold">{countdown}</span> seconds
          </div>
        </div>
      </div>
    </div>
  );
}
