import { useEffect } from 'react';

interface ToastProps {
  message: string;
  type?: 'info' | 'success' | 'error' | 'warning';
  onClose: () => void;
  duration?: number;
}

const COLORS = {
  info: 'bg-gray-800 text-white',
  success: 'bg-green-700 text-white',
  error: 'bg-red-600 text-white',
  warning: 'bg-amber-500 text-white',
};

export default function Toast({ message, type = 'info', onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [onClose, duration]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
      <div className={`${COLORS[type]} px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-sm`}>
        {message}
      </div>
    </div>
  );
}
