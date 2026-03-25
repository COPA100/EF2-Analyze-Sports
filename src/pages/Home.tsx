import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-8 p-4">
      <div className="text-center">
        <p className="text-6xl mb-3" aria-hidden="true">🏀</p>
        <h1 className="text-4xl font-bold tracking-tight">C4K Basketball</h1>
        <p className="text-gray-400 text-base mt-2">Tabletop Shot Tracker</p>
      </div>
      <p className="text-gray-400 text-lg">Choose your game mode</p>
      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button
          onClick={() => navigate("/setup?mode=individual")}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xl font-semibold py-4 px-8 rounded-xl transition-colors"
        >
          Individual Play
        </button>
        <button
          onClick={() => navigate("/setup?mode=team")}
          className="bg-green-600 hover:bg-green-700 text-white text-xl font-semibold py-4 px-8 rounded-xl transition-colors"
        >
          Team Play
        </button>
      </div>
      <button
        onClick={() => navigate("/leaderboard")}
        className="bg-yellow-600 hover:bg-yellow-700 text-white text-xl font-semibold py-4 px-8 rounded-xl transition-colors w-full max-w-xs"
      >
        Leaderboard
      </button>
      <p className="text-gray-500 text-sm mt-4">
        Individual: 20 shots per player &middot; Team: 30 shots per team
      </p>
      <button
        onClick={() => navigate("/dashboard")}
        className="text-gray-400 hover:text-white text-sm underline underline-offset-4 mt-2 transition-colors"
      >
        View Dashboard
      </button>
    </div>
  );
}
