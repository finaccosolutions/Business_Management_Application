import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Loader } from 'lucide-react';

export default function EmailVerified() {
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/login');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-green-500 to-green-600 rounded-full mb-4 animate-bounce">
              <CheckCircle className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Email Verified!</h1>
            <p className="text-gray-600 text-lg">
              Your email has been successfully verified.
            </p>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800 text-center">
              You can now access all features of your account.
            </p>
          </div>

          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2 text-gray-600">
              <Loader className="w-4 h-4 animate-spin" />
              <span>Redirecting to login in {countdown} seconds...</span>
            </div>

            <button
              onClick={() => navigate('/login')}
              className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white py-3 rounded-lg font-medium hover:from-green-600 hover:to-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transform transition-all duration-200 hover:scale-[1.02]"
            >
              Go to Login Now
            </button>
          </div>

          <div className="text-center text-sm text-gray-500">
            <p>Ready to start managing your business!</p>
          </div>
        </div>
      </div>
    </div>
  );
}
