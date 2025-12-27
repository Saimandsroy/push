'use client';

import { FileObject } from '@/lib/types';
import { usePricing } from '@/hooks/usePricing';
import { formatCurrency } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';

interface OrderSummaryProps {
  files: FileObject[];
  onCheckout: () => void;
  disabled?: boolean;
}

export function OrderSummary({ files, onCheckout, disabled = false }: OrderSummaryProps) {
  const { calculatePrice } = usePricing();

  if (files.length === 0) {
    return null;
  }

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

  const totalAmount = calculateTotal();
  const totalFiles = files.length;
  const totalPages = files.reduce((sum, file) => {
    const pagesToPrint = file.pageSelection === 'all' ? file.pages : file.selectedPages.length;
    return sum + (pagesToPrint * file.copies);
  }, 0);

  return (
    <Card className="sticky top-4">
      <CardHeader>
        <CardTitle className="text-xl font-bold text-gray-900 flex items-center gap-2">
          📋 Order Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="bg-blue-50 p-3 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{totalFiles}</div>
            <div className="text-sm text-gray-600">Files</div>
          </div>
          <div className="bg-green-50 p-3 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{totalPages}</div>
            <div className="text-sm text-gray-600">Pages</div>
          </div>
          <div className="bg-purple-50 p-3 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">{formatCurrency(totalAmount)}</div>
            <div className="text-sm text-gray-600">Total</div>
          </div>
        </div>

        {/* File Details */}
        <div className="space-y-2">
          <h4 className="font-semibold text-gray-900">Items:</h4>
          {files.map((file) => {
            const pagesToPrint = file.pageSelection === 'all' ? file.pages : file.selectedPages.length;
            const isPdf = file.file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
            const itemTotal = calculatePrice(
              file.paperSize,
              file.colorMode,
              pagesToPrint,
              file.copies,
              file.paperType || 'normal',
              Boolean(file.duplex && isPdf)
            );
            
            return (
              <div key={file.id} className="flex justify-between items-start text-sm bg-gray-50 p-3 rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{file.name}</div>
                  <div className="text-gray-600">
                    {file.paperSize} {file.colorMode.toUpperCase()} • {(file.paperType || 'normal').toUpperCase()} •
                    {file.duplex && isPdf ? ' Duplex' : ' Simplex'} • {pagesToPrint} pages × {file.copies} copies
                  </div>
                </div>
                <div className="font-semibold text-gray-900 ml-2">
                  {formatCurrency(itemTotal)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Total */}
        <div className="border-t pt-4">
          <div className="flex justify-between items-center text-lg font-bold">
            <span>Total Amount:</span>
            <span className="text-blue-600">{formatCurrency(totalAmount)}</span>
          </div>
        </div>

        {/* Checkout Button */}
        <Button 
          onClick={onCheckout}
          className="w-full"
          size="lg"
          data-checkout-btn
          disabled={disabled || totalAmount < 1}
        >
          Proceed to Checkout
        </Button>

        {(totalAmount < 1) && (
          <p className="text-sm text-red-600 text-center">
            Minimum order amount is ₹1.00
          </p>
        )}

        {disabled && (
          <p className="text-sm text-amber-600 text-center">
            Initializing session... please wait
          </p>
        )}
      </CardContent>
    </Card>
  );
}
