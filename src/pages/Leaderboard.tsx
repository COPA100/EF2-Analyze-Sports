import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { GameSession, Shot } from "../types";

type SortBy = "points" | "accuracy" | "rating";

// Rating = points * sqrt(accuracy/100)
// Rewards high scorers who are also accurate — a 30pt/60% player
// rates higher than a 30pt/40% player, but points still dominate.
function calcRating(points: number, accuracy: number): number {
  return Math.round(points * Math.sqrt(accuracy / 100) * 10) / 10;
}

interface PlayerStats {
  id: string;
  points: number;
  games: number;
  accuracy: number;
  rating: number;
  makes: number;
  shots: number;
}

interface BestGame {
  id: string;
  points: number;
  accuracy: number;
  rating: number;
  makes: number;
  shots: number;
}

export default function Leaderboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [lifetime, setLifetime] = useState<PlayerStats[]>([]);
  const [bestGames, setBestGames] = useState<BestGame[]>([]);
  const [lifetimeSort, setLifetimeSort] = useState<SortBy>("points");
  const [bestSort, setBestSort] = useState<SortBy>("points");

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

        const lifetimeRanked = Object.entries(stats).map(([id, s]) => {
          const accuracy = s.shots > 0 ? Math.round((s.makes / s.shots) * 100) : 0;
          return {
            id,
            points: s.points,
            games: s.games,
            makes: s.makes,
            shots: s.shots,
            accuracy,
            rating: calcRating(s.points, accuracy),
          };
        });

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
            rating: calcRating(g.points, acc),
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

  function sortList<T extends { points: number; accuracy: number; rating: number }>(
    list: T[],
    sortBy: SortBy
  ): T[] {
    return [...list].sort((a, b) => {
      if (sortBy === "points") return b.points - a.points || b.accuracy - a.accuracy;
      if (sortBy === "accuracy") return b.accuracy - a.accuracy || b.points - a.points;
      return b.rating - a.rating || b.points - a.points;
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-xl">Loading leaderboard...</p>
      </div>
    );
  }

  const sortedBest = sortList(bestGames, bestSort);
  const sortedLifetime = sortList(lifetime, lifetimeSort);
  function getMax(list: { points: number; accuracy: number; rating: number }[], sortBy: SortBy): number {
    if (list.length === 0) return 1;
    if (sortBy === "points") return list[0].points;
    if (sortBy === "accuracy") return list[0].accuracy;
    return list[0].rating;
  }
  const bestMax = getMax(sortedBest, bestSort);
  const lifetimeMax = getMax(sortedLifetime, lifetimeSort);

  function FilterButton({
    active,
    label,
    onClick,
  }: {
    active: boolean;
    label: string;
    onClick: () => void;
  }) {
    return (
      <button
        onClick={onClick}
        className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
          active
            ? "bg-blue-600 text-white"
            : "bg-gray-800 text-gray-400 hover:text-white"
        }`}
      >
        {label}
      </button>
    );
  }

  function RankRow({
    rank,
    id,
    points,
    accuracy,
    rating,
    subtitle,
    barValue,
    barMax,
    barLabel,
    sortBy,
  }: {
    rank: number;
    id: string;
    points: number;
    accuracy: number;
    rating: number;
    subtitle: string;
    barValue: number;
    barMax: number;
    barLabel: string;
    sortBy: SortBy;
  }) {
    const medal =
      rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
    return (
      <div
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
              {id}
            </span>
            <span className="text-xs text-gray-400 ml-2 shrink-0">
              {subtitle}
            </span>
          </div>
          <div className="bg-gray-700 rounded-full h-4 overflow-hidden">
            <div
              className={`h-full rounded-full flex items-center justify-end pr-2 text-[10px] font-bold transition-all ${
                rank === 1
                  ? "bg-yellow-500 text-gray-900"
                  : rank === 2
                    ? "bg-gray-300 text-gray-900"
                    : rank === 3
                      ? "bg-orange-600 text-white"
                      : "bg-blue-500 text-white"
              }`}
              style={{
                width: `${barMax > 0 ? (barValue / barMax) * 100 : 0}%`,
                minWidth: "3rem",
              }}
            >
              {barLabel}
            </div>
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {sortBy === "points"
              ? `${accuracy}% accuracy · ${rating} rating`
              : sortBy === "accuracy"
                ? `${points} pts · ${rating} rating`
                : `${points} pts · ${accuracy}% accuracy`}
          </p>
        </div>
      </div>
    );
  }

  const empty = lifetime.length === 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 pb-12">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate("/")}
          className="text-gray-400 hover:text-white mb-6 block"
        >
          &larr; Back
        </button>

        <h1 className="text-3xl font-bold text-center mb-8">Leaderboard</h1>

        {empty ? (
          <div className="text-center py-12">
            <p className="text-xl text-gray-400">No individual games yet.</p>
            <p className="text-gray-500 text-sm mt-2">
              Play some games to see the leaderboard!
            </p>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-6">
            {/* Best Individual Game */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-yellow-400">
                  Best Individual Game
                </h2>
                <div className="flex gap-1">
                  <FilterButton
                    active={bestSort === "points"}
                    label="Points"
                    onClick={() => setBestSort("points")}
                  />
                  <FilterButton
                    active={bestSort === "accuracy"}
                    label="Accuracy"
                    onClick={() => setBestSort("accuracy")}
                  />
                  <FilterButton
                    active={bestSort === "rating"}
                    label="Rating"
                    onClick={() => setBestSort("rating")}
                  />
                </div>
              </div>
              <div className="space-y-2">
                {sortedBest.map((p, i) => (
                  <RankRow
                    key={p.id}
                    rank={i + 1}
                    id={p.id}
                    points={p.points}
                    accuracy={p.accuracy}
                    rating={p.rating}
                    subtitle={`${p.makes}/${p.shots} makes`}
                    barValue={
                      bestSort === "points" ? p.points : bestSort === "accuracy" ? p.accuracy : p.rating
                    }
                    barMax={bestMax}
                    barLabel={
                      bestSort === "points"
                        ? `${p.points} pts`
                        : bestSort === "accuracy"
                          ? `${p.accuracy}%`
                          : `${p.rating}`
                    }
                    sortBy={bestSort}
                  />
                ))}
              </div>
            </div>

            {/* Lifetime */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-blue-400">
                  Lifetime
                </h2>
                <div className="flex gap-1">
                  <FilterButton
                    active={lifetimeSort === "points"}
                    label="Points"
                    onClick={() => setLifetimeSort("points")}
                  />
                  <FilterButton
                    active={lifetimeSort === "accuracy"}
                    label="Accuracy"
                    onClick={() => setLifetimeSort("accuracy")}
                  />
                  <FilterButton
                    active={lifetimeSort === "rating"}
                    label="Rating"
                    onClick={() => setLifetimeSort("rating")}
                  />
                </div>
              </div>
              <div className="space-y-2">
                {sortedLifetime.map((p, i) => (
                  <RankRow
                    key={p.id}
                    rank={i + 1}
                    id={p.id}
                    points={p.points}
                    accuracy={p.accuracy}
                    rating={p.rating}
                    subtitle={`${p.games} game${p.games !== 1 ? "s" : ""}`}
                    barValue={
                      lifetimeSort === "points" ? p.points : lifetimeSort === "accuracy" ? p.accuracy : p.rating
                    }
                    barMax={lifetimeMax}
                    barLabel={
                      lifetimeSort === "points"
                        ? `${p.points} pts`
                        : lifetimeSort === "accuracy"
                          ? `${p.accuracy}%`
                          : `${p.rating}`
                    }
                    sortBy={lifetimeSort}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
