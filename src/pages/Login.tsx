import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { createUser } from '../lib/firebase';
import Toast from '../components/Toast';

export default function Login() {
  const [playerId, setPlayerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useUser();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = playerId.trim();
    if (!trimmed) {
      setError('Please enter your Player ID');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await createUser(trimmed);
      login(trimmed);
      navigate('/home');
    } catch (err) {
      console.error('Login error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Sign-in failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo / Branding */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-600/20">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Analyze Sports</h1>
          <p className="text-gray-500 mt-1 text-sm">Track shots, analyze performance</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <form onSubmit={handleSubmit}>
            <label htmlFor="playerId" className="block text-sm font-medium text-gray-700 mb-2">
              Player ID
            </label>
            <input
              id="playerId"
              type="text"
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
              placeholder="Enter your name tag ID"
              autoFocus
              autoComplete="off"
              className="w-full px-4 py-3 rounded-xl border border-gray-300 text-gray-900
                         placeholder:text-gray-400 focus:outline-none focus:ring-2
                         focus:ring-blue-500 focus:border-transparent transition-shadow text-base"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400
                         text-white font-medium py-3 rounded-xl transition-colors
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in…
                </span>
              ) : (
                'Continue'
              )}
            </button>
          </form>
        </div>
      </div>

      {error && <Toast message={error} type="error" onClose={() => setError(null)} />}
    </div>
  );
}
