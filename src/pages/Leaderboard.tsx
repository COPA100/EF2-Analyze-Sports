import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { GameSession, Shot } from "../types";

type SortBy = "points" | "accuracy";
type Tab = "best" | "lifetime";

interface PlayerStats {
  id: string;
  points: number;
  games: number;
  accuracy: number;
  makes: number;
  shots: number;
}

interface BestGame {
  id: string;
  points: number;
  accuracy: number;
  makes: number;
  shots: number;
}

export default function Leaderboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [lifetime, setLifetime] = useState<PlayerStats[]>([]);
  const [bestGames, setBestGames] = useState<BestGame[]>([]);
  const [tab, setTab] = useState<Tab>("best");
  const [sortBy, setSortBy] = useState<SortBy>("points");

  useEffect(() => {
    async function load() {
      try {
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

        const shotsSnap = await getDocs(collection(db, "shots"));
        const allShots = shotsSnap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as Shot
        );

        const gameIds = new Set(sessions.map((s) => s.id));
        const individualShots = allShots.filter(
          (s) => s.activityType === "individual" && gameIds.has(s.gameId)
        );

        // --- Lifetime stats ---
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

        const lifetimeRanked = Object.entries(stats).map(([id, s]) => ({
          id,
          points: s.points,
          games: s.games,
          makes: s.makes,
          shots: s.shots,
          accuracy: s.shots > 0 ? Math.round((s.makes / s.shots) * 100) : 0,
        }));

        setLifetime(lifetimeRanked);

        // --- Best individual game ---
        const perGame: Record<
          string,
          { playerId: string; points: number; makes: number; shots: number }
        > = {};

        for (const sess of sessions) {
          const pid = sess.playerIds[0];
          perGame[sess.id!] = { playerId: pid, points: 0, makes: 0, shots: 0 };
        }

        for (const s of individualShots) {
          const g = perGame[s.gameId];
          if (!g) continue;
          g.points += s.pointsEarned;
          g.shots++;
          if (s.result === "make") g.makes++;
        }

        // Keep only the best game per player
        const bestByPlayer: Record<string, BestGame> = {};
        for (const g of Object.values(perGame)) {
          const acc =
            g.shots > 0 ? Math.round((g.makes / g.shots) * 100) : 0;
          const entry: BestGame = {
            id: g.playerId,
            points: g.points,
            accuracy: acc,
            makes: g.makes,
            shots: g.shots,
          };
          if (
            !bestByPlayer[g.playerId] ||
            g.points > bestByPlayer[g.playerId].points
          ) {
            bestByPlayer[g.playerId] = entry;
          }
        }

        setBestGames(Object.values(bestByPlayer));
      } catch (e) {
        console.error("Failed to load leaderboard:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function sortList<T extends { points: number; accuracy: number }>(
    list: T[],
  ): T[] {
    return [...list].sort((a, b) =>
      sortBy === "points"
        ? b.points - a.points || b.accuracy - a.accuracy
        : b.accuracy - a.accuracy || b.points - a.points
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-xl">Loading leaderboard...</p>
      </div>
    );
  }

  const activeList = tab === "best" ? sortList(bestGames) : sortList(lifetime);
  const barMax =
    activeList.length > 0
      ? sortBy === "points"
        ? activeList[0].points
        : activeList[0].accuracy
      : 1;

  const empty = lifetime.length === 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 pb-12">
      <div className="max-w-lg mx-auto">
        <button
          onClick={() => navigate("/")}
          className="text-gray-400 hover:text-white mb-6 block"
        >
          &larr; Back
        </button>

        <h1 className="text-3xl font-bold text-center mb-6">Leaderboard</h1>

        {/* Tab toggle */}
        <div className="flex bg-gray-800 rounded-xl p-1 mb-4">
          <button
            onClick={() => setTab("best")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === "best"
                ? "bg-yellow-500 text-gray-900"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Best Individual Game
          </button>
          <button
            onClick={() => setTab("lifetime")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === "lifetime"
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Lifetime
          </button>
        </div>

        {/* Sort filter */}
        <div className="flex justify-end gap-1 mb-4">
          <button
            onClick={() => setSortBy("points")}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              sortBy === "points"
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            Points
          </button>
          <button
            onClick={() => setSortBy("accuracy")}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              sortBy === "accuracy"
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            Accuracy
          </button>
        </div>

        {empty ? (
          <div className="text-center py-12">
            <p className="text-xl text-gray-400">No individual games yet.</p>
            <p className="text-gray-500 text-sm mt-2">
              Play some games to see the leaderboard!
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeList.map((p, i) => {
              const rank = i + 1;
              const medal =
                rank === 1
                  ? "\u{1F947}"
                  : rank === 2
                    ? "\u{1F948}"
                    : rank === 3
                      ? "\u{1F949}"
                      : null;
              const subtitle =
                tab === "best"
                  ? `${(p as BestGame).makes}/${(p as BestGame).shots} makes`
                  : `${(p as PlayerStats).games} game${(p as PlayerStats).games !== 1 ? "s" : ""}`;
              const barValue = sortBy === "points" ? p.points : p.accuracy;
              const barLabel = sortBy === "points" ? `${p.points} pts` : `${p.accuracy}%`;
              const secondaryStat = sortBy === "points" ? `${p.accuracy}% accuracy` : `${p.points} pts`;

              return (
                <div
                  key={p.id}
                  className={`bg-gray-800 rounded-xl p-3 flex items-center gap-3 ${
                    rank <= 3 ? "border border-yellow-500/30" : ""
                  }`}
                >
                  <div className="w-8 text-center shrink-0">
                    {medal ? (
                      <span className="text-xl">{medal}</span>
                    ) : (
                      <span className="text-sm font-bold text-gray-500">{rank}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between mb-1">
                      <span
                        className={`font-semibold truncate text-sm ${
                          rank <= 3 ? "text-yellow-400" : "text-white"
                        }`}
                      >
                        {p.id}
                      </span>
                      <span className="text-xs text-gray-400 ml-2 shrink-0">
                        {subtitle}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-700 rounded-full h-4 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            rank === 1
                              ? "bg-yellow-500"
                              : rank === 2
                                ? "bg-gray-300"
                                : rank === 3
                                  ? "bg-orange-600"
                                  : "bg-blue-500"
                          }`}
                          style={{
                            width: `${barMax > 0 ? (barValue / barMax) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <span className={`text-[10px] font-bold shrink-0 ${
                        rank === 1
                          ? "text-yellow-400"
                          : rank === 2
                            ? "text-gray-300"
                            : rank === 3
                              ? "text-orange-400"
                              : "text-blue-400"
                      }`}>
                        {barLabel}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {secondaryStat}
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
