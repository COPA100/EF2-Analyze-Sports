import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { getGamesByPlayer } from '../lib/firebase';
import type { GameSession } from '../types';
import TopBar from '../components/TopBar';

export default function Home() {
  const { playerId, logout } = useUser();
  const navigate = useNavigate();
  const [pastGames, setPastGames] = useState<GameSession[]>([]);
  const [loadingGames, setLoadingGames] = useState(true);

  useEffect(() => {
    if (!playerId) return;
    setLoadingGames(true);
    getGamesByPlayer(playerId)
      .then(setPastGames)
      .catch(console.error)
      .finally(() => setLoadingGames(false));
  }, [playerId]);

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar
        title="Analyze Sports"
        trailing={
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium"
          >
            Sign out
          </button>
        }
      />

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Player badge */}
        <div className="flex items-center gap-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <span className="text-blue-700 font-semibold text-sm">
              {playerId?.slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="font-medium text-gray-900">Player {playerId}</p>
            <p className="text-xs text-gray-500">Ready to play</p>
          </div>
        </div>

        {/* Activity selection */}
        <div>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3 px-1">
            Start a game
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate('/setup/individual')}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5
                         hover:shadow-md hover:border-blue-200 transition-all text-left group"
            >
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center mb-3 group-hover:bg-green-100 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34a853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <h3 className="font-medium text-gray-900">Individual</h3>
              <p className="text-xs text-gray-500 mt-1">20 shots · Solo play</p>
            </button>

            <button
              onClick={() => navigate('/setup/team')}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5
                         hover:shadow-md hover:border-blue-200 transition-all text-left group"
            >
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mb-3 group-hover:bg-blue-100 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3 className="font-medium text-gray-900">Team</h3>
              <p className="text-xs text-gray-500 mt-1">30 shots · 2+ players</p>
            </button>
          </div>
        </div>

        {/* Past Games */}
        <div>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3 px-1">
            Past games
          </h2>
          {loadingGames ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
              <div className="animate-spin h-5 w-5 border-2 border-gray-300 border-t-blue-600 rounded-full mx-auto" />
            </div>
          ) : pastGames.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
              <p className="text-gray-400 text-sm">No games yet. Start your first game above!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pastGames.map((game) => (
                <button
                  key={game.id}
                  onClick={() => navigate(`/analysis/${game.id}`)}
                  className="w-full bg-white rounded-xl shadow-sm border border-gray-100 p-4
                             hover:shadow-md transition-all text-left flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${
                        game.activityType === 'individual'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-blue-50 text-blue-700'
                      }`}>
                        {game.activityType}
                      </span>
                      <span className="text-xs text-gray-400">Table {game.tableId}</span>
                    </div>
                    <p className="text-sm text-gray-900 mt-1">
                      {game.totalPoints} pts · {game.totalShots} shots
                      {game.totalShots > 0 && (
                        <span className="text-gray-400">
                          {' '}· {((game.statsSummary?.playerPerformance?.[playerId!]?.accuracy ?? 0) * 100).toFixed(0)}% accuracy
                        </span>
                      )}
                    </p>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
