'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Clock, ExternalLink } from 'lucide-react';
import { Button } from './ui/Button';

interface SuccessModalProps {
  orderId: string;
  paymentMethod: string;
  sessionId: string;
  onClose: () => void;
}

export function SuccessModal({ orderId, paymentMethod, sessionId, onClose }: SuccessModalProps) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
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

  const statusIcon = paymentMethod === 'cash' ? '⏳' : '✅';
  const statusText = paymentMethod === 'cash' ? 'Order Submitted!' : 'Order Created!';
  const statusMessage = paymentMethod === 'cash' 
    ? 'Your cash order is awaiting admin approval' 
    : 'Your order has been successfully created';

  const handleCheckStatus = () => {
    // In a real app, this would navigate to the status page
    window.open(`/status?sessionId=${sessionId}`, '_blank');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-8 text-center animate-in zoom-in duration-300">
        <div className="text-6xl mb-6 animate-pulse">{statusIcon}</div>
        
        <h2 className="text-2xl font-bold text-gray-900 mb-3">{statusText}</h2>
        <p className="text-gray-600 mb-6">{statusMessage}</p>
        
        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <p className="font-semibold text-gray-900">Order ID: {orderId.split('_')[1] || orderId}</p>
        </div>
        
        <p className="text-gray-600 mb-6 text-sm">
          {paymentMethod === 'cash' 
            ? 'Please wait for admin approval or visit the shop directly.' 
            : 'Check your order status for updates on printing progress.'}
        </p>
        
        <div className="space-y-3">
          <Button onClick={handleCheckStatus} className="w-full" size="lg">
            <ExternalLink className="h-4 w-4 mr-2" />
            Check Status
          </Button>
          
          <p className="text-sm text-gray-500">
            This modal will close automatically in {countdown} seconds
          </p>
        </div>
      </div>
    </div>
  );
}
