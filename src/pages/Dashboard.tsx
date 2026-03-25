import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  getDocs,
  query,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { ZONE_POINTS } from "../lib/scoring";
import type { GameSession, Shot } from "../types";
import ZoneGrid from "../components/ZoneGrid";

export default function Dashboard() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetKey, setResetKey] = useState("");
  const [resetKeyError, setResetKeyError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const sessSnap = await getDocs(
          query(collection(db, "gameSessions"), orderBy("startTime", "desc"))
        );
        const sessList = sessSnap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as GameSession
        );

        const shotsSnap = await getDocs(collection(db, "shots"));
        const shotsList = shotsSnap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as Shot
        );

        setSessions(sessList);
        setShots(shotsList);
      } catch (e) {
        setError("Failed to load dashboard data.");
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function resetAllData() {
    if (resetKey !== "c4kclubhouse") {
      setResetKeyError("Incorrect key.");
      return;
    }
    setResetKeyError("");
    setResetting(true);
    try {
      // Firestore batches can hold 500 ops max, so chunk deletes
      for (const col of ["shots", "gameSessions", "users"]) {
        const snap = await getDocs(collection(db, col));
        const docs = snap.docs;
        for (let i = 0; i < docs.length; i += 500) {
          const batch = writeBatch(db);
          docs.slice(i, i + 500).forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
      setSessions([]);
      setShots([]);
      setShowResetConfirm(false);
    } catch (e) {
      console.error("Reset failed:", e);
      setError("Failed to reset data.");
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-xl">Loading dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-4">
        <p className="text-red-400 text-xl">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-xl font-semibold"
        >
          Retry
        </button>
      </div>
    );
  }

  const completedSessions = sessions.filter((s) => s.isCompleted);
  const individualSessions = sessions.filter(
    (s) => s.activityType === "individual"
  );
  const teamSessions = sessions.filter((s) => s.activityType === "team");

  // Unique players
  const allPlayerIds = [...new Set(sessions.flatMap((s) => s.playerIds))];

  // ── Zone aggregate data ──
  const zoneData: Record<number, { makes: number; misses: number }> = {};
  for (let z = 1; z <= 6; z++) zoneData[z] = { makes: 0, misses: 0 };
  for (const s of shots) {
    if (s.result === "make") zoneData[s.shotFrom].makes++;
    else zoneData[s.shotFrom].misses++;
  }

  // Points per zone
  const zonePoints: Record<number, number> = {};
  for (let z = 1; z <= 6; z++) {
    zonePoints[z] = zoneData[z].makes * ZONE_POINTS[z];
  }
  const maxZonePoints = Math.max(...Object.values(zonePoints), 1);

  // Zone accuracy
  const zoneAccuracy: Record<number, number> = {};
  for (let z = 1; z <= 6; z++) {
    const total = zoneData[z].makes + zoneData[z].misses;
    zoneAccuracy[z] = total > 0 ? Math.round((zoneData[z].makes / total) * 100) : 0;
  }

  // ── Totals ──
  const totalShots = shots.length;
  const totalMakes = shots.filter((s) => s.result === "make").length;
  const totalPoints = shots.reduce((sum, s) => sum + s.pointsEarned, 0);
  const overallAccuracy =
    totalShots > 0 ? Math.round((totalMakes / totalShots) * 100) : 0;

  // ── Per-player stats ──
  const playerStats: Record<
    string,
    { shots: number; makes: number; points: number; games: number }
  > = {};
  for (const id of allPlayerIds) {
    playerStats[id] = { shots: 0, makes: 0, points: 0, games: 0 };
  }
  for (const s of shots) {
    const ps = playerStats[s.playerId];
    if (ps) {
      ps.shots++;
      if (s.result === "make") ps.makes++;
      ps.points += s.pointsEarned;
    }
  }
  for (const sess of sessions) {
    for (const pid of sess.playerIds) {
      if (playerStats[pid]) playerStats[pid].games++;
    }
  }

  // Top players by points
  const topByPoints = [...allPlayerIds]
    .filter((id) => playerStats[id].shots > 0)
    .sort((a, b) => playerStats[b].points - playerStats[a].points)
    .slice(0, 10);

  // Top players by accuracy (min 5 shots)
  const topByAccuracy = [...allPlayerIds]
    .filter((id) => playerStats[id].shots >= 5)
    .sort((a, b) => {
      const accA = playerStats[a].makes / playerStats[a].shots;
      const accB = playerStats[b].makes / playerStats[b].shots;
      return accB - accA;
    })
    .slice(0, 10);

  // ── Shot distribution by zone ──
  const zoneShotCounts: Record<number, number> = {};
  for (let z = 1; z <= 6; z++) {
    zoneShotCounts[z] = zoneData[z].makes + zoneData[z].misses;
  }
  const maxZoneShots = Math.max(...Object.values(zoneShotCounts), 1);

  // ── Best zone (highest accuracy with min 3 shots) ──
  let bestZone = 1;
  let bestZoneAcc = 0;
  for (let z = 1; z <= 6; z++) {
    const total = zoneData[z].makes + zoneData[z].misses;
    if (total >= 3 && zoneAccuracy[z] > bestZoneAcc) {
      bestZoneAcc = zoneAccuracy[z];
      bestZone = z;
    }
  }

  // ── Most popular zone ──
  let popularZone = 1;
  let popularCount = 0;
  for (let z = 1; z <= 6; z++) {
    if (zoneShotCounts[z] > popularCount) {
      popularCount = zoneShotCounts[z];
      popularZone = z;
    }
  }

  // ── Recent games ──
  const recentGames = sessions.slice(0, 8);

  // ── Points per game trend ──
  const gamePointsTrend = completedSessions
    .slice()
    .reverse()
    .slice(-12)
    .map((s, i) => ({
      label: `G${i + 1}`,
      points: s.totalPoints,
      gameId: s.id,
    }));
  const maxTrendPoints = Math.max(...gamePointsTrend.map((g) => g.points), 1);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 pb-12">
      <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate("/")}
          className="text-gray-400 hover:text-white text-sm py-2 pr-4"
        >
          &larr; Home
        </button>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <button
          onClick={() => setShowResetConfirm(true)}
          className="text-red-400 hover:text-red-300 text-sm py-2 pl-4"
        >
          Reset Data
        </button>
      </div>

      {/* Reset confirmation modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl p-6 max-w-sm w-full text-center">
            <p className="text-xl font-bold mb-2">Reset All Data?</p>
            <p className="text-gray-400 text-sm mb-4">
              This will permanently delete all games, shots, and player records.
              This cannot be undone.
            </p>
            <input
              type="password"
              value={resetKey}
              onChange={(e) => { setResetKey(e.target.value); setResetKeyError(""); }}
              onKeyDown={(e) => e.key === "Enter" && resetAllData()}
              placeholder="Enter reset key"
              className="w-full bg-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 outline-none focus-visible:ring-2 focus:ring-red-500 mb-2"
            />
            {resetKeyError && (
              <p className="text-red-400 text-sm mb-2">{resetKeyError}</p>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setShowResetConfirm(false); setResetKey(""); setResetKeyError(""); }}
                disabled={resetting}
                className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-xl font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={resetAllData}
                disabled={resetting || !resetKey}
                className="flex-1 bg-red-600 hover:bg-red-700 py-3 rounded-xl font-semibold transition-colors disabled:opacity-50"
              >
                {resetting ? "Deleting..." : "Delete Everything"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* No data state */}
      {sessions.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-6xl mb-4" aria-hidden="true">
            📊
          </p>
          <p className="text-xl text-gray-400">No games played yet.</p>
          <p className="text-gray-500 mt-2">
            Play some games and come back to see your stats!
          </p>
          <button
            onClick={() => navigate("/")}
            className="mt-6 bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-xl font-semibold"
          >
            Start a Game
          </button>
        </div>
      ) : (
        <>
          {/* ── Overview Cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <StatCard value={sessions.length} label="Total Games" color="text-blue-400" />
            <StatCard value={allPlayerIds.length} label="Players" color="text-purple-400" />
            <StatCard value={totalShots} label="Total Shots" color="text-white" />
            <StatCard value={`${overallAccuracy}%`} label="Accuracy" color="text-green-400" />
            <StatCard value={totalPoints} label="Total Points" color="text-yellow-400" />
            <StatCard value={totalMakes} label="Makes" color="text-green-400" />
            <StatCard value={totalShots - totalMakes} label="Misses" color="text-red-400" />
            <StatCard
              value={totalShots > 0 ? (totalPoints / totalShots).toFixed(1) : "0"}
              label="Pts/Shot"
              color="text-orange-400"
            />
          </div>

          {/* ── Game Mode Breakdown ── */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-3">Game Mode Breakdown</h2>
            <div className="flex gap-3">
              <div className="flex-1 bg-gray-800 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-blue-400">
                  {individualSessions.length}
                </p>
                <p className="text-sm text-gray-400">Individual</p>
              </div>
              <div className="flex-1 bg-gray-800 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-green-400">
                  {teamSessions.length}
                </p>
                <p className="text-sm text-gray-400">Team</p>
              </div>
              <div className="flex-1 bg-gray-800 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-yellow-400">
                  {completedSessions.length}
                </p>
                <p className="text-sm text-gray-400">Completed</p>
              </div>
            </div>
          </div>

          {/* ── All-Time Heatmap ── */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-3 text-center">
              All-Time Shot Heatmap
            </h2>
            <div className="max-w-md mx-auto">
              <ZoneGrid mode="heatmap" zoneData={zoneData} />
              <div className="flex justify-center gap-4 mt-3 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-green-600 rounded" /> &ge;66%
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-orange-500 rounded" /> 33-66%
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-red-600 rounded" /> &lt;33%
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-gray-800 rounded border border-gray-700" />{" "}
                  No shots
                </span>
              </div>
            </div>
          </div>

          {/* ── Zone Insights Row ── */}
          <div className="grid grid-cols-2 gap-3 mb-8">
            <div className="bg-gray-800 rounded-xl p-4 text-center">
              <p className="text-sm text-gray-400 mb-1">Best Zone</p>
              <p className="text-2xl font-bold text-green-400">
                Zone {bestZone}
              </p>
              <p className="text-xs text-gray-500">{bestZoneAcc}% accuracy</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 text-center">
              <p className="text-sm text-gray-400 mb-1">Most Popular Zone</p>
              <p className="text-2xl font-bold text-blue-400">
                Zone {popularZone}
              </p>
              <p className="text-xs text-gray-500">{popularCount} shots</p>
            </div>
          </div>

          {/* ── Zone Accuracy Bars ── */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-3">Zone Accuracy</h2>
            <div className="space-y-2">
              {[1, 2, 3, 4, 5, 6].map((z) => {
                const total = zoneData[z].makes + zoneData[z].misses;
                const acc = zoneAccuracy[z];
                return (
                  <div key={z} className="flex items-center gap-3">
                    <span className="w-16 text-sm text-gray-400">
                      Zone {z}{" "}
                      <span className="text-gray-600">({ZONE_POINTS[z]}pt)</span>
                    </span>
                    <div className="flex-1 bg-gray-800 rounded-full h-6 overflow-hidden">
                      <div
                        className={`h-full rounded-full flex items-center justify-end pr-2 text-xs font-bold transition-all ${
                          acc >= 66
                            ? "bg-green-600"
                            : acc >= 33
                              ? "bg-orange-500"
                              : "bg-red-600"
                        }`}
                        style={{
                          width: `${acc}%`,
                          minWidth: total > 0 ? "3rem" : 0,
                        }}
                      >
                        {total > 0 ? `${acc}%` : ""}
                      </div>
                    </div>
                    <span className="text-xs text-gray-500 w-14 text-right">
                      {zoneData[z].makes}/{total}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Points by Zone ── */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-3">Points by Zone</h2>
            <div className="space-y-2">
              {[1, 2, 3, 4, 5, 6].map((z) => (
                <div key={z} className="flex items-center gap-3">
                  <span className="w-16 text-sm text-gray-400">Zone {z}</span>
                  <div className="flex-1 bg-gray-800 rounded-full h-6 overflow-hidden">
                    <div
                      className="bg-blue-500 h-full rounded-full flex items-center justify-end pr-2 text-xs font-bold transition-all"
                      style={{
                        width: `${(zonePoints[z] / maxZonePoints) * 100}%`,
                        minWidth: zonePoints[z] > 0 ? "2rem" : 0,
                      }}
                    >
                      {zonePoints[z] > 0 ? zonePoints[z] : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Shot Volume by Zone ── */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-3">Shot Volume by Zone</h2>
            <div className="space-y-2">
              {[1, 2, 3, 4, 5, 6].map((z) => (
                <div key={z} className="flex items-center gap-3">
                  <span className="w-16 text-sm text-gray-400">Zone {z}</span>
                  <div className="flex-1 bg-gray-800 rounded-full h-6 overflow-hidden">
                    <div
                      className="bg-purple-500 h-full rounded-full flex items-center justify-end pr-2 text-xs font-bold transition-all"
                      style={{
                        width: `${(zoneShotCounts[z] / maxZoneShots) * 100}%`,
                        minWidth: zoneShotCounts[z] > 0 ? "2rem" : 0,
                      }}
                    >
                      {zoneShotCounts[z] > 0 ? zoneShotCounts[z] : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Points Per Game Trend ── */}
          {gamePointsTrend.length > 1 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-3">
                Points Per Game Trend
              </h2>
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-end gap-1 h-32">
                  {gamePointsTrend.map((g, i) => (
                    <div
                      key={i}
                      className="flex-1 flex flex-col items-center justify-end h-full"
                    >
                      <span className="text-xs text-gray-300 mb-1">
                        {g.points}
                      </span>
                      <div
                        className="w-full bg-blue-500 rounded-t transition-all cursor-pointer hover:bg-blue-400"
                        style={{
                          height: `${(g.points / maxTrendPoints) * 100}%`,
                          minHeight: g.points > 0 ? "4px" : 0,
                        }}
                        title={`Game: ${g.points} pts`}
                        onClick={() => g.gameId && navigate(`/stats/${g.gameId}`)}
                      />
                      <span className="text-[10px] text-gray-500 mt-1">
                        {g.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Top Players by Points ── */}
          {topByPoints.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-3">
                Top Players by Points
              </h2>
              <div className="space-y-2">
                {topByPoints.map((id, i) => {
                  const ps = playerStats[id];
                  const maxPts = playerStats[topByPoints[0]].points || 1;
                  return (
                    <div key={id} className="flex items-center gap-3">
                      <span className="w-6 text-sm text-gray-500 text-right">
                        {i + 1}.
                      </span>
                      <span className="w-24 text-sm text-gray-300 truncate">
                        {id}
                      </span>
                      <div className="flex-1 bg-gray-800 rounded-full h-6 overflow-hidden">
                        <div
                          className="bg-yellow-500 h-full rounded-full flex items-center justify-end pr-2 text-xs font-bold text-gray-900 transition-all"
                          style={{
                            width: `${(ps.points / maxPts) * 100}%`,
                            minWidth: "3rem",
                          }}
                        >
                          {ps.points} pts
                        </div>
                      </div>
                      <span className="text-xs text-gray-500 w-16 text-right">
                        {ps.games} game{ps.games !== 1 ? "s" : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Top Players by Accuracy ── */}
          {topByAccuracy.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-3">
                Top Players by Accuracy{" "}
                <span className="text-sm text-gray-500 font-normal">
                  (min 5 shots)
                </span>
              </h2>
              <div className="space-y-2">
                {topByAccuracy.map((id, i) => {
                  const ps = playerStats[id];
                  const acc = Math.round((ps.makes / ps.shots) * 100);
                  return (
                    <div key={id} className="flex items-center gap-3">
                      <span className="w-6 text-sm text-gray-500 text-right">
                        {i + 1}.
                      </span>
                      <span className="w-24 text-sm text-gray-300 truncate">
                        {id}
                      </span>
                      <div className="flex-1 bg-gray-800 rounded-full h-6 overflow-hidden">
                        <div
                          className={`h-full rounded-full flex items-center justify-end pr-2 text-xs font-bold transition-all ${
                            acc >= 66
                              ? "bg-green-500"
                              : acc >= 33
                                ? "bg-orange-500"
                                : "bg-red-500"
                          }`}
                          style={{
                            width: `${acc}%`,
                            minWidth: "3rem",
                          }}
                        >
                          {acc}%
                        </div>
                      </div>
                      <span className="text-xs text-gray-500 w-14 text-right">
                        {ps.makes}/{ps.shots}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Recent Games ── */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-3">Recent Games</h2>
            <div className="space-y-2">
              {recentGames.map((sess) => {
                const date = sess.startTime?.toDate?.();
                const dateStr = date
                  ? date.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : "Unknown";
                return (
                  <button
                    key={sess.id}
                    onClick={() => navigate(`/stats/${sess.id}`)}
                    className="w-full bg-gray-800 hover:bg-gray-750 rounded-xl p-3 flex items-center justify-between text-left transition-colors hover:bg-gray-700"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        <span
                          className={
                            sess.activityType === "team"
                              ? "text-green-400"
                              : "text-blue-400"
                          }
                        >
                          {sess.activityType === "team" ? "Team" : "Individual"}
                        </span>{" "}
                        <span className="text-gray-500">&middot;</span>{" "}
                        <span className="text-gray-300">
                          {sess.playerIds.length} player
                          {sess.playerIds.length !== 1 ? "s" : ""}
                        </span>
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{dateStr}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-yellow-400">
                        {sess.totalPoints} pts
                      </p>
                      <p className="text-xs text-gray-500">
                        {sess.isCompleted ? "Completed" : "In progress"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
      </div>
    </div>
  );
}

function StatCard({
  value,
  label,
  color,
}: {
  value: string | number;
  label: string;
  color: string;
}) {
  return (
    <div className="bg-gray-800 rounded-xl p-3 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}
