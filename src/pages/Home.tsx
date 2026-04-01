import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-green-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="text-center mb-10 relative">
        <div className="text-7xl mb-4 animate-bounce" style={{ animationDuration: "2s" }}>
          <span aria-hidden="true">🏀</span>
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-orange-400 via-yellow-300 to-orange-400 bg-clip-text text-transparent">
          C4K Basketball
        </h1>
        <p className="text-gray-400 text-lg mt-2 tracking-wide">
          Tabletop Shot Tracker
        </p>
      </div>

      {/* Game mode cards */}
      <p className="text-gray-500 text-sm font-semibold uppercase tracking-widest mb-4">
        Choose your game mode
      </p>
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-lg mb-6">
        <button
          onClick={() => navigate("/setup?mode=individual")}
          className="flex-1 group relative bg-gray-900 border border-blue-500/20 hover:border-blue-400/50 rounded-2xl p-6 transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_0_30px_rgba(59,130,246,0.15)]"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative">
            <div className="text-3xl mb-2">👤</div>
            <div className="text-xl font-bold text-blue-400 mb-1">Individual Play</div>
            <div className="text-gray-500 text-sm">20 shots per player</div>
          </div>
        </button>
        <button
          onClick={() => navigate("/setup?mode=team")}
          className="flex-1 group relative bg-gray-900 border border-green-500/20 hover:border-green-400/50 rounded-2xl p-6 transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_0_30px_rgba(34,197,94,0.15)]"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-green-600/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative">
            <div className="text-3xl mb-2">👥</div>
            <div className="text-xl font-bold text-green-400 mb-1">Team Play</div>
            <div className="text-gray-500 text-sm">30 shots per team</div>
          </div>
        </button>
      </div>

      {/* Secondary actions */}
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-lg">
        <button
          onClick={() => navigate("/leaderboard")}
          className="flex-1 group relative bg-gray-900 border border-yellow-500/20 hover:border-yellow-400/50 rounded-xl px-5 py-4 transition-all duration-300 hover:shadow-[0_0_20px_rgba(234,179,8,0.1)]"
        >
          <div className="flex items-center justify-center gap-3">
            <span className="text-2xl">🏆</span>
            <span className="text-lg font-semibold text-yellow-400">Leaderboard</span>
          </div>
        </button>
        <button
          onClick={() => navigate("/dashboard")}
          className="flex-1 group relative bg-gray-900 border border-purple-500/20 hover:border-purple-400/50 rounded-xl px-5 py-4 transition-all duration-300 hover:shadow-[0_0_20px_rgba(168,85,247,0.1)]"
        >
          <div className="flex items-center justify-center gap-3">
            <span className="text-2xl">📊</span>
            <span className="text-lg font-semibold text-purple-400">Dashboard</span>
          </div>
        </button>
      </div>

      {/* Footer */}
      <div className="mt-12 text-center">
        <div className="flex items-center justify-center gap-2 text-gray-600 text-xs">
          <div className="h-px w-8 bg-gray-800" />
          <span>Zones 1-6 &middot; Track &middot; Analyze &middot; Improve</span>
          <div className="h-px w-8 bg-gray-800" />
        </div>
      </div>
    </div>
  );
}
