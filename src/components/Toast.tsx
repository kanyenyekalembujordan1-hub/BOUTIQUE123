/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

interface ToastProps {
  key?: React.Key;
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, type = 'success', onClose, duration = 4000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const bgColors = {
    success: 'bg-[#F2ECE4] border-[#6B705C] text-[#3F3D3A]',
    error: 'bg-[#FDF3F0] border-[#C15C3D] text-[#A94A2D]',
    info: 'bg-[#F5F1E9] border-[#A99F90] text-[#5C5549]'
  };

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-[#586F61]" />,
    error: <AlertCircle className="w-5 h-5 text-[#C15C3D]" />,
    info: <AlertCircle className="w-5 h-5 text-[#8A7E72]" />
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full pointer-events-auto">
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        className={`flex items-center gap-3 p-4 rounded-xl border shadow-lg ${bgColors[type]}`}
      >
        <div className="flex-shrink-0">
          {icons[type]}
        </div>
        <div className="flex-1 text-sm font-medium">
          {message}
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1 hover:bg-[#E8DFD3] rounded-full transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </motion.div>
    </div>
  );
}
