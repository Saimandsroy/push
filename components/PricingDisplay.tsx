'use client';

import { PricingConfig } from '@/lib/types';

interface PricingDisplayProps {
  pricing: PricingConfig;
}

export function PricingDisplay({ pricing }: PricingDisplayProps) {
  const cards: Array<{ key: string; title: string; icon: string; price: number }> = [];
  if (typeof pricing.a4_bw === 'number') cards.push({ key: 'a4_bw', title: 'A4 B&W', icon: '🖤', price: pricing.a4_bw });
  if (typeof pricing.a4_color === 'number') cards.push({ key: 'a4_color', title: 'A4 Color', icon: '🌈', price: pricing.a4_color });
  if (typeof pricing.a3_bw === 'number') cards.push({ key: 'a3_bw', title: 'A3 B&W', icon: '📄', price: pricing.a3_bw as number });
  if (typeof pricing.a3_color === 'number') cards.push({ key: 'a3_color', title: 'A3 Color', icon: '🎨', price: pricing.a3_color as number });

  return (
    <div className="mb-6">
      <h2 className="text-base font-semibold text-gray-800 mb-3">📋 Current Pricing</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {cards.map((card) => (
          <div
            key={card.key}
            className={`relative bg-white rounded-md p-3 border border-gray-200 transition-all duration-200 hover:shadow-sm`}
          >
            
            <div className="text-center">
              <div className="text-lg mb-1">{card.icon}</div>
              <h3 className="font-medium text-xs text-gray-800 mb-0.5">{card.title}</h3>
              <div className="text-base font-bold text-blue-600 mb-0.5">
                ₹{card.price.toFixed(2)}
              </div>
              {/* description removed intentionally */}
              <div className="text-[10px] text-gray-400">per page</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
