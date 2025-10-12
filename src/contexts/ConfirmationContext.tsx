import { createContext, useContext, useState, ReactNode } from 'react';

interface ConfirmationOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: 'red' | 'blue' | 'green';
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

interface ConfirmationContextType {
  showConfirmation: (options: ConfirmationOptions) => void;
  hideConfirmation: () => void;
}

const ConfirmationContext = createContext<ConfirmationContextType | undefined>(undefined);

export function useConfirmation() {
  const context = useContext(ConfirmationContext);
  if (!context) {
    throw new Error('useConfirmation must be used within ConfirmationProvider');
  }
  return context;
}

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmationOptions | null>(null);

  const showConfirmation = (opts: ConfirmationOptions) => {
    setOptions(opts);
    setIsOpen(true);
  };

  const hideConfirmation = () => {
    setIsOpen(false);
    setTimeout(() => setOptions(null), 300);
  };

  const handleConfirm = async () => {
    if (options?.onConfirm) {
      await options.onConfirm();
    }
    hideConfirmation();
  };

  const handleCancel = () => {
    if (options?.onCancel) {
      options.onCancel();
    }
    hideConfirmation();
  };

  const colorClasses = {
    red: 'bg-red-600 hover:bg-red-700',
    blue: 'bg-blue-600 hover:bg-blue-700',
    green: 'bg-green-600 hover:bg-green-700',
  };

  return (
    <ConfirmationContext.Provider value={{ showConfirmation, hideConfirmation }}>
      {children}
      
      {isOpen && options && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full animate-scale-in">
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {options.title}
              </h3>
              <p className="text-gray-600 mb-6">
                {options.message}
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={handleCancel}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  {options.cancelText || 'Cancel'}
                </button>
                <button
                  onClick={handleConfirm}
                  className={`flex-1 px-4 py-2.5 text-white rounded-lg transition-colors font-medium ${
                    colorClasses[options.confirmColor || 'blue']
                  }`}
                >
                  {options.confirmText || 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }
      `}</style>
    </ConfirmationContext.Provider>
  );
}
