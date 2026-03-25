import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { GameSession, Shot } from "../types";

export default function Leaderboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<
    { id: string; points: number; games: number; accuracy: number }[]
  >([]);

  useEffect(() => {
    async function load() {
      try {
        // Get only individual completed sessions
        const sessSnap = await getDocs(
          query(
            collection(db, "gameSessions"),
            where("activityType", "==", "individual"),
            where("isCompleted", "==", true)
          )
        );
        const sessions = sessSnap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as GameSession
        );

        if (sessions.length === 0) {
          setLoading(false);
          return;
        }

        // Get all shots for these games
        const shotsSnap = await getDocs(collection(db, "shots"));
        const allShots = shotsSnap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as Shot
        );

        // Only individual game shots
        const gameIds = new Set(sessions.map((s) => s.id));
        const individualShots = allShots.filter(
          (s) => s.activityType === "individual" && gameIds.has(s.gameId)
        );

        // Aggregate per player
        const stats: Record<
          string,
          { points: number; games: number; makes: number; shots: number }
        > = {};

        for (const sess of sessions) {
          for (const pid of sess.playerIds) {
            if (!stats[pid])
              stats[pid] = { points: 0, games: 0, makes: 0, shots: 0 };
            stats[pid].games++;
          }
        }

        for (const s of individualShots) {
          if (!stats[s.playerId])
            stats[s.playerId] = { points: 0, games: 0, makes: 0, shots: 0 };
          stats[s.playerId].points += s.pointsEarned;
          stats[s.playerId].shots++;
          if (s.result === "make") stats[s.playerId].makes++;
        }

        const ranked = Object.entries(stats)
          .map(([id, s]) => ({
            id,
            points: s.points,
            games: s.games,
            accuracy:
              s.shots > 0 ? Math.round((s.makes / s.shots) * 100) : 0,
          }))
          .sort((a, b) => b.points - a.points);

        setPlayers(ranked);
      } catch (e) {
        console.error("Failed to load leaderboard:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-xl">Loading leaderboard...</p>
      </div>
    );
  }

  const maxPoints = players.length > 0 ? players[0].points : 1;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 pb-12">
      <div className="max-w-lg mx-auto">
        <button
          onClick={() => navigate("/")}
          className="text-gray-400 hover:text-white mb-6 block"
        >
          &larr; Back
        </button>

        <h1 className="text-3xl font-bold text-center mb-2">Leaderboard</h1>
        <p className="text-gray-500 text-sm text-center mb-8">
          Individual Play &middot; All-Time Points
        </p>

        {players.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-xl text-gray-400">No individual games yet.</p>
            <p className="text-gray-500 text-sm mt-2">
              Play some games to see the leaderboard!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {players.map((p, i) => {
              const rank = i + 1;
              const medal =
                rank === 1
                  ? "🥇"
                  : rank === 2
                    ? "🥈"
                    : rank === 3
                      ? "🥉"
                      : null;
              return (
                <div
                  key={p.id}
                  className={`bg-gray-800 rounded-xl p-4 flex items-center gap-4 ${
                    rank <= 3 ? "border border-yellow-500/30" : ""
                  }`}
                >
                  {/* Rank */}
                  <div className="w-10 text-center">
                    {medal ? (
                      <span className="text-2xl">{medal}</span>
                    ) : (
                      <span className="text-lg font-bold text-gray-500">
                        {rank}
                      </span>
                    )}
                  </div>

                  {/* Player info + bar */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between mb-1">
                      <span
                        className={`font-semibold truncate ${
                          rank <= 3 ? "text-yellow-400" : "text-white"
                        }`}
                      >
                        {p.id}
                      </span>
                      <span className="text-sm text-gray-400 ml-2 shrink-0">
                        {p.games} game{p.games !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="bg-gray-700 rounded-full h-5 overflow-hidden">
                      <div
                        className={`h-full rounded-full flex items-center justify-end pr-2 text-xs font-bold transition-all ${
                          rank === 1
                            ? "bg-yellow-500 text-gray-900"
                            : rank === 2
                              ? "bg-gray-300 text-gray-900"
                              : rank === 3
                                ? "bg-orange-600 text-white"
                                : "bg-blue-500 text-white"
                        }`}
                        style={{
                          width: `${(p.points / maxPoints) * 100}%`,
                          minWidth: "3.5rem",
                        }}
                      >
                        {p.points} pts
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {p.accuracy}% accuracy
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
