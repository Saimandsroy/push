'use client';

import { useEffect } from 'react';

export function GlobalErrorHandler() {
  useEffect(() => {
    // Global error handler
    const handleError = (event: ErrorEvent) => {
      console.error('Global Error:', event.error);
      showGlobalError('An unexpected error occurred');
    };

    // Unhandled promise rejection handler
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled Promise Rejection:', event.reason);
      showGlobalError('An unexpected error occurred');
    };

    // Keyboard shortcuts
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl/Cmd + U: Upload files (target first file input on page)
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'u') {
        event.preventDefault();
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
        fileInput?.click();
      }

      // Ctrl/Cmd + Enter: Checkout
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        const checkoutBtn = document.querySelector('[data-checkout-btn]') as HTMLButtonElement | null;
        if (checkoutBtn && !checkoutBtn.disabled) {
          checkoutBtn.click();
        }
      }

      // Escape: Close modals
      if (event.key === 'Escape') {
        const modals = document.querySelectorAll('[data-modal]');
        modals.forEach(modal => {
          const closeBtn = modal.querySelector('[data-close]') as HTMLButtonElement;
          closeBtn?.click();
        });
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return null;
}

function showGlobalError(message: string) {
  // Remove existing error
  const existing = document.getElementById('globalError');
  if (existing) existing.remove();

  const errorDiv = document.createElement('div');
  errorDiv.id = 'globalError';
  errorDiv.className = 'fixed top-5 right-5 bg-red-500 text-white p-4 rounded-lg max-w-sm z-50 shadow-lg';
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);

  setTimeout(() => {
    errorDiv.remove();
  }, 5000);
}
