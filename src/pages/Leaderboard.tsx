import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { GameSession, Shot } from "../types";
import InfoTooltip from "../components/InfoTooltip";

type SortBy = "points" | "accuracy";
type Tab = "best" | "lifetime";

const ZONE_NAMES: Record<number, string> = {
  1: "Zone 1",
  2: "Zone 2",
  3: "Zone 3",
  4: "Zone 4",
  5: "Zone 5",
  6: "Zone 6",
};

function calcBestZone(shots: Shot[]): number {
  const zoneMakes: Record<number, number> = {};
  for (const s of shots) {
    if (s.result === "make") {
      zoneMakes[s.shotFrom] = (zoneMakes[s.shotFrom] || 0) + 1;
    }
  }
  let best = 1;
  let bestCount = 0;
  for (const [zone, count] of Object.entries(zoneMakes)) {
    if (count > bestCount) {
      bestCount = count;
      best = Number(zone);
    }
  }
  return best;
}

function calcThreePtAccuracy(shots: Shot[]): number {
  const threePt = shots.filter((s) => s.shotFrom >= 4);
  if (threePt.length === 0) return 0;
  const makes = threePt.filter((s) => s.result === "make").length;
  return Math.round((makes / threePt.length) * 100);
}

interface PlayerStats {
  id: string;
  ppg: number;
  games: number;
  accuracy: number;
  bestZone: number;
  threePtAccuracy: number;
  points: number;
}

interface BestGame {
  id: string;
  points: number;
  accuracy: number;
  bestZone: number;
  threePtAccuracy: number;
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
        // Fetch ALL sessions for lifetime stats
        const allSessSnap = await getDocs(collection(db, "gameSessions"));
        const allSessions = allSessSnap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as GameSession
        );

        // Individual completed sessions (for "Best Individual Game" tab)
        const individualSessions = allSessions.filter(
          (s) => s.activityType === "individual" && s.isCompleted
        );

        if (allSessions.length === 0) {
          setLoading(false);
          return;
        }

        const shotsSnap = await getDocs(collection(db, "shots"));
        const allShots = shotsSnap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as Shot
        );

        const individualGameIds = new Set(individualSessions.map((s) => s.id));
        const individualShots = allShots.filter(
          (s) => s.activityType === "individual" && individualGameIds.has(s.gameId)
        );

        // --- Lifetime stats (ALL games: individual + team) ---
        const playerGames: Record<string, number> = {};
        for (const sess of allSessions) {
          for (const pid of sess.playerIds) {
            playerGames[pid] = (playerGames[pid] || 0) + 1;
          }
        }

        // Group ALL shots by player (individual + team)
        const shotsByPlayer: Record<string, Shot[]> = {};
        for (const s of allShots) {
          if (!shotsByPlayer[s.playerId]) shotsByPlayer[s.playerId] = [];
          shotsByPlayer[s.playerId].push(s);
        }

        const lifetimeRanked: PlayerStats[] = Object.entries(shotsByPlayer).map(
          ([id, shots]) => {
            const games = playerGames[id] || 1;
            const totalPoints = shots.reduce((sum, s) => sum + s.pointsEarned, 0);
            const makes = shots.filter((s) => s.result === "make").length;
            return {
              id,
              points: totalPoints,
              ppg: Math.round((totalPoints / games) * 10) / 10,
              games,
              accuracy: shots.length > 0 ? Math.round((makes / shots.length) * 100) : 0,
              bestZone: calcBestZone(shots),
              threePtAccuracy: calcThreePtAccuracy(shots),
            };
          }
        );

        setLifetime(lifetimeRanked);

        // --- Best individual game ---
        // Group shots by game
        const shotsByGame: Record<string, Shot[]> = {};
        for (const s of individualShots) {
          if (!shotsByGame[s.gameId]) shotsByGame[s.gameId] = [];
          shotsByGame[s.gameId].push(s);
        }

        // Map game -> player
        const gamePlayer: Record<string, string> = {};
        for (const sess of individualSessions) {
          gamePlayer[sess.id!] = sess.playerIds[0];
        }

        const bestByPlayer: Record<string, BestGame> = {};
        for (const [gameId, shots] of Object.entries(shotsByGame)) {
          const playerId = gamePlayer[gameId];
          if (!playerId) continue;
          const points = shots.reduce((sum, s) => sum + s.pointsEarned, 0);
          const makes = shots.filter((s) => s.result === "make").length;
          const acc = shots.length > 0 ? Math.round((makes / shots.length) * 100) : 0;
          const entry: BestGame = {
            id: playerId,
            points,
            accuracy: acc,
            bestZone: calcBestZone(shots),
            threePtAccuracy: calcThreePtAccuracy(shots),
          };
          if (!bestByPlayer[playerId] || points > bestByPlayer[playerId].points) {
            bestByPlayer[playerId] = entry;
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

        <div className="flex items-center justify-center gap-2 mb-6">
          <h1 className="text-3xl font-bold text-center">Leaderboard</h1>
          <InfoTooltip
            text={tab === "best"
              ? "Rankings based on each player's highest-scoring individual game. Shows their best single-game performance."
              : "All-time rankings across all games (individual + team). Shows cumulative stats and averages."}
          />
        </div>

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

              const isLifetime = tab === "lifetime";
              const subtitle = isLifetime
                ? `${(p as PlayerStats).games} game${(p as PlayerStats).games !== 1 ? "s" : ""} | ${(p as PlayerStats).ppg} ppg`
                : `${p.points} pts`;

              const barValue = sortBy === "points" ? p.points : p.accuracy;
              const barLabel = sortBy === "points" ? `${p.points} pts` : `${p.accuracy}%`;

              const rankColor =
                rank === 1
                  ? "text-yellow-400"
                  : rank === 2
                    ? "text-gray-300"
                    : rank === 3
                      ? "text-orange-400"
                      : "text-blue-400";

              const barBg =
                rank === 1
                  ? "bg-yellow-500"
                  : rank === 2
                    ? "bg-gray-300"
                    : rank === 3
                      ? "bg-orange-600"
                      : "bg-blue-500";

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
                        {barValue > 0 && (
                          <div
                            className={`h-full rounded-full transition-all ${barBg}`}
                            style={{
                              width: `${barMax > 0 ? (barValue / barMax) * 100 : 0}%`,
                            }}
                          />
                        )}
                      </div>
                      <span className={`text-[10px] font-bold shrink-0 ${rankColor}`}>
                        {barLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[10px] text-gray-500">
                        {sortBy === "points" ? `${p.accuracy}% acc` : `${p.points} pts`}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        Best: {ZONE_NAMES[p.bestZone]}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        3pt: {p.threePtAccuracy}%
                      </span>
                    </div>
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
