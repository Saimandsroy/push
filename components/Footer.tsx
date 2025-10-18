'use client';

import Image from 'next/image';

export function Footer() {
  return (
    <footer className="mt-16 border-t border-gray-200 bg-gray-50">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-sm text-gray-600">
          <span>Built in</span>
          <div className="flex items-center gap-2 font-semibold text-gray-800">
            <Image 
              src="/fs.png" 
              alt="Femur Studio" 
              width={20} 
              height={20}
              className="rounded"
            />
            <span>Femur Studio</span>
          </div>
          <span>by</span>
          <div className="flex items-center gap-2 font-semibold ">
            <span className='text-blue-600'>prane</span>
            <Image 
              src="/prane.jpg" 
              alt="Prane" 
              width={20} 
              height={20}
              className="rounded-full"
            />
            <span className='text-black'>& team</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
