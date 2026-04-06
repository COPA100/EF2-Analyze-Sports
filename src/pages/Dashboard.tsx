import { useState, useEffect, type ReactNode } from "react";
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
import BasketballCourtHeatMap, { zoneDataToShots } from "../components/BasketballCourtHeatMap";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  LineChart,
  Line,
} from "recharts";

type View = "all" | "player";

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

  // View toggle
  const [view, setView] = useState<View>("all");
  const [lookupInput, setLookupInput] = useState("");
  const [lookupId, setLookupId] = useState("");

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

  function handleLookup() {
    const id = lookupInput.trim();
    if (id) setLookupId(id);
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

  return (
    <div className="h-screen bg-gray-950 text-white p-2 overflow-hidden lg:overflow-hidden max-lg:overflow-y-auto max-lg:min-h-screen">
      <div className="max-w-[1600px] mx-auto h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={() => navigate("/")}
            className="text-gray-400 hover:text-white text-sm py-1 pr-4"
          >
            &larr; Home
          </button>
          <h1 className="text-lg font-bold">Dashboard</h1>
          <button
            onClick={() => setShowResetConfirm(true)}
            className="text-red-400 hover:text-red-300 text-sm py-1 pl-4"
          >
            Reset Data
          </button>
        </div>

        {/* View toggle */}
        <div className="flex gap-1 bg-gray-800 rounded-lg p-0.5 mb-2">
          <button
            onClick={() => setView("all")}
            className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              view === "all"
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            All Players
          </button>
          <button
            onClick={() => setView("player")}
            className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              view === "player"
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Player Lookup
          </button>
        </div>

        {/* Reset confirmation modal */}
        {showResetConfirm && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-2xl p-6 max-w-sm w-full text-center">
              <p className="text-xl font-bold mb-2">Reset All Data?</p>
              <p className="text-gray-400 text-sm mb-4">
                This will permanently delete all games, shots, and player
                records. This cannot be undone.
              </p>
              <input
                type="password"
                value={resetKey}
                onChange={(e) => {
                  setResetKey(e.target.value);
                  setResetKeyError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && resetAllData()}
                placeholder="Enter reset key"
                className="w-full bg-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 outline-none focus-visible:ring-2 focus:ring-red-500 mb-2"
              />
              {resetKeyError && (
                <p className="text-red-400 text-sm mb-2">{resetKeyError}</p>
              )}
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => {
                    setShowResetConfirm(false);
                    setResetKey("");
                    setResetKeyError("");
                  }}
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

        <div className="flex-1 min-h-0 overflow-hidden max-lg:overflow-visible">
          {view === "all" ? (
            <AllPlayersView
              sessions={sessions}
              shots={shots}
              navigate={navigate}
            />
          ) : (
            <div className="lg:flex lg:flex-col">
            {/* Player ID input */}
            <div className="flex gap-2 mt-2 mb-6 max-w-sm mx-auto">
              <input
                type="text"
                value={lookupInput}
                onChange={(e) => setLookupInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                placeholder="Enter Player ID"
                autoFocus
                className="flex-1 bg-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus-visible:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleLookup}
                disabled={!lookupInput.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 px-5 py-3 rounded-xl font-semibold transition-colors"
              >
                Look Up
              </button>
            </div>
              {lookupId ? (
                <PlayerView
                  playerId={lookupId}
                  sessions={sessions}
                  shots={shots}
                  navigate={navigate}
                />
              ) : (
                <p className="text-center text-gray-500 mt-12">
                  Enter a Player ID to see their lifetime stats.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   All Players View (existing global dashboard)
   ════════════════════════════════════════════ */

function AllPlayersView({
  sessions,
  shots,
  navigate,
}: {
  sessions: GameSession[];
  shots: Shot[];
  navigate: (path: string) => void;
}) {
  if (sessions.length === 0) {
    return (
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
    );
  }

  const completedSessions = sessions.filter((s) => s.isCompleted);
  const individualSessions = sessions.filter(
    (s) => s.activityType === "individual"
  );
  const teamSessions = sessions.filter((s) => s.activityType === "team");
  const allPlayerIds = [...new Set(sessions.flatMap((s) => s.playerIds))];

  // Zone aggregate data
  const zoneData: Record<number, { makes: number; misses: number }> = {};
  for (let z = 1; z <= 6; z++) zoneData[z] = { makes: 0, misses: 0 };
  for (const s of shots) {
    if (s.result === "make") zoneData[s.shotFrom].makes++;
    else zoneData[s.shotFrom].misses++;
  }

  const zonePoints: Record<number, number> = {};
  for (let z = 1; z <= 6; z++)
    zonePoints[z] = zoneData[z].makes * ZONE_POINTS[z];
  const zoneAccuracy: Record<number, number> = {};
  for (let z = 1; z <= 6; z++) {
    const total = zoneData[z].makes + zoneData[z].misses;
    zoneAccuracy[z] =
      total > 0 ? Math.round((zoneData[z].makes / total) * 100) : 0;
  }

  const totalShots = shots.length;
  const totalMakes = shots.filter((s) => s.result === "make").length;
  const totalPoints = shots.reduce((sum, s) => sum + s.pointsEarned, 0);
  const overallAccuracy =
    totalShots > 0 ? Math.round((totalMakes / totalShots) * 100) : 0;

  // Per-player stats
  const playerStats: Record<
    string,
    { shots: number; makes: number; points: number; games: number }
  > = {};
  for (const id of allPlayerIds)
    playerStats[id] = { shots: 0, makes: 0, points: 0, games: 0 };
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

  const topByPoints = [...allPlayerIds]
    .filter((id) => playerStats[id].shots > 0)
    .sort((a, b) => playerStats[b].points - playerStats[a].points)
    .slice(0, 10);

  const topByAccuracy = [...allPlayerIds]
    .filter((id) => playerStats[id].shots >= 5)
    .sort((a, b) => {
      const accA = playerStats[a].makes / playerStats[a].shots;
      const accB = playerStats[b].makes / playerStats[b].shots;
      return accB - accA;
    })
    .slice(0, 10);

  const zoneShotCounts: Record<number, number> = {};
  for (let z = 1; z <= 6; z++)
    zoneShotCounts[z] = zoneData[z].makes + zoneData[z].misses;
  let bestZone = 1;
  let bestZoneAcc = 0;
  for (let z = 1; z <= 6; z++) {
    const total = zoneData[z].makes + zoneData[z].misses;
    if (total >= 3 && zoneAccuracy[z] > bestZoneAcc) {
      bestZoneAcc = zoneAccuracy[z];
      bestZone = z;
    }
  }

  let popularZone = 1;
  let popularCount = 0;
  for (let z = 1; z <= 6; z++) {
    if (zoneShotCounts[z] > popularCount) {
      popularCount = zoneShotCounts[z];
      popularZone = z;
    }
  }

  const recentGames = sessions.slice(0, 8);

  const gamePointsTrend = completedSessions
    .slice()
    .reverse()
    .slice(-12)
    .map((s, i) => ({
      label: `G${i + 1}`,
      points: s.totalPoints,
      gameId: s.id,
    }));
  return (
    <div>
      {/* Stat cards row */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2 mb-3">
        <StatCard value={sessions.length} label="Games" color="text-blue-400" />
        <StatCard value={allPlayerIds.length} label="Players" color="text-purple-400" />
        <StatCard value={totalShots} label="Shots" color="text-white" />
        <StatCard value={`${overallAccuracy}%`} label="Accuracy" color="text-green-400" />
        <StatCard value={totalPoints} label="Points" color="text-yellow-400" />
        <StatCard value={totalMakes} label="Makes" color="text-green-400" />
        <StatCard value={totalShots - totalMakes} label="Misses" color="text-red-400" />
        <StatCard value={totalShots > 0 ? (totalPoints / totalShots).toFixed(1) : "0"} label="Pts/Shot" color="text-orange-400" />
      </div>

      {/* Top row: Accuracy | Heatmap (center, big) | Breakdown */}
      <div className="grid lg:grid-cols-12 gap-3 mb-3">
        <DashboardPanel title="Zone Accuracy" className="lg:col-span-3 lg:order-1">
          <ResponsiveContainer width="100%" height={185}>
            <RadarChart
              data={[1, 2, 3, 4, 5, 6].map((z) => ({
                zone: `Z${z} (${ZONE_POINTS[z]}pt)`,
                accuracy: zoneAccuracy[z],
              }))}
            >
              <PolarGrid stroke="#374151" />
              <PolarAngleAxis dataKey="zone" tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <PolarRadiusAxis tick={{ fill: "#6b7280", fontSize: 10 }} domain={[0, 100]} />
              <Radar name="Accuracy %" dataKey="accuracy" stroke="#22c55e" fill="#22c55e" fillOpacity={0.25} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                labelStyle={{ color: "#f3f4f6" }}
                itemStyle={{ color: "#d1d5db" }}
                formatter={(value) => [`${value ?? 0}%`]}
              />
            </RadarChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-2 w-full mt-1">
            <div className="bg-gray-800 rounded-lg p-1.5 text-center">
              <p className="text-base font-bold text-green-400">Z{bestZone}</p>
              <p className="text-[10px] text-gray-500">Best ({bestZoneAcc}%)</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-1.5 text-center">
              <p className="text-base font-bold text-blue-400">Z{popularZone}</p>
              <p className="text-[10px] text-gray-500">Fav ({popularCount})</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 w-full mt-2">
            <div className="bg-gray-800 rounded-lg p-1.5 text-center">
              <p className="text-base font-bold text-blue-400">{individualSessions.length}</p>
              <p className="text-[10px] text-gray-400">Indiv</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-1.5 text-center">
              <p className="text-base font-bold text-green-400">{teamSessions.length}</p>
              <p className="text-[10px] text-gray-400">Team</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-1.5 text-center">
              <p className="text-base font-bold text-yellow-400">{completedSessions.length}</p>
              <p className="text-[10px] text-gray-400">Done</p>
            </div>
          </div>
        </DashboardPanel>

        <DashboardPanel title="Shot Heatmap" className="lg:col-span-6 lg:order-2">
          <div className="w-full max-w-[340px] mx-auto">
            <BasketballCourtHeatMap
              shots={zoneDataToShots(zoneData)}
              title=""
              compact
              showLegend={false}
              showZoneStats={false}
              showQuickInsight={false}
              courtMaxWidthClass="max-w-[340px]"
            />
            <div className="flex items-center justify-center gap-2 mt-2 text-xs text-gray-400">
              <span>0%</span>
              <div className="h-3 w-28 rounded" style={{ background: "linear-gradient(to right, hsl(0,80%,40%), hsl(40,90%,50%), hsl(140,70%,40%))" }} />
              <span>100%</span>
            </div>
          </div>
        </DashboardPanel>

        <DashboardPanel title="Zone Breakdown" className="lg:col-span-3 lg:order-3">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart
              data={[1, 2, 3, 4, 5, 6].map((z) => ({
                zone: `Z${z}`,
                makes: zoneData[z].makes,
                misses: zoneData[z].misses,
              }))}
              margin={{ top: 5, right: 10, left: -15, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="zone" tick={{ fill: "#9ca3af", fontSize: 12 }} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                labelStyle={{ color: "#f3f4f6" }}
                itemStyle={{ color: "#d1d5db" }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />
              <Bar dataKey="makes" name="Makes" fill="#22c55e" radius={[4, 4, 0, 0]} stackId="shots" />
              <Bar dataKey="misses" name="Misses" fill="#ef4444" radius={[4, 4, 0, 0]} stackId="shots" />
            </BarChart>
          </ResponsiveContainer>
        </DashboardPanel>
      </div>

      {/* Bottom row: Leaderboards + Recent Games + Trend */}
      <div className="grid lg:grid-cols-12 gap-3">
        {topByPoints.length > 0 && (
          <DashboardPanel title="Top Players by Points" className="lg:col-span-3">
            <ResponsiveContainer width="100%" height={165}>
              <BarChart
                layout="vertical"
                data={topByPoints.map((id) => ({
                  name: id,
                  points: playerStats[id].points,
                }))}
                margin={{ top: 5, right: 20, left: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#d1d5db", fontSize: 12 }} width={60} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                  labelStyle={{ color: "#f3f4f6" }}
                  itemStyle={{ color: "#d1d5db" }}
                  formatter={(value) => [`${Number(value ?? 0)} pts`, "Points"]}
                />
                <Bar dataKey="points" name="Points" radius={[0, 4, 4, 0]} barSize={18}>
                  {topByPoints.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? "#eab308" : i === 1 ? "#9ca3af" : i === 2 ? "#f97316" : "#3b82f6"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </DashboardPanel>
        )}

        {topByAccuracy.length > 0 && (
          <DashboardPanel title="Top Players by Accuracy" className="lg:col-span-3">
            <ResponsiveContainer width="100%" height={165}>
              <BarChart
                layout="vertical"
                data={topByAccuracy.map((id) => {
                  const ps = playerStats[id];
                  return {
                    name: id,
                    accuracy: Math.round((ps.makes / ps.shots) * 100),
                  };
                })}
                margin={{ top: 5, right: 20, left: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: "#6b7280", fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#d1d5db", fontSize: 12 }} width={60} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                  labelStyle={{ color: "#f3f4f6" }}
                  itemStyle={{ color: "#d1d5db" }}
                  formatter={(value) => [`${Number(value ?? 0)}%`, "Accuracy"]}
                />
                <Bar dataKey="accuracy" name="Accuracy" radius={[0, 4, 4, 0]} barSize={18}>
                  {topByAccuracy.map((id) => {
                    const ps = playerStats[id];
                    const acc = Math.round((ps.makes / ps.shots) * 100);
                    return <Cell key={id} fill={acc >= 66 ? "#22c55e" : acc >= 33 ? "#f97316" : "#ef4444"} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </DashboardPanel>
        )}

        <DashboardPanel title="Recent Games" className="lg:col-span-3" bodyClassName="space-y-1.5 overflow-y-auto max-h-[165px]">
          {recentGames.map((sess) => {
            const date = sess.startTime?.toDate?.();
            const dateStr = date
              ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : "Unknown";
            return (
              <button
                key={sess.id}
                onClick={() => navigate(`/stats/${sess.id}`)}
                className="w-full bg-gray-800 rounded-lg p-2 flex items-center justify-between text-left transition-colors hover:bg-gray-700"
              >
                <div>
                  <p className="text-xs font-medium">
                    <span className={sess.activityType === "team" ? "text-green-400" : "text-blue-400"}>
                      {sess.activityType === "team" ? "Team" : "Indiv"}
                    </span>
                    <span className="text-gray-500 ml-1.5">{dateStr}</span>
                  </p>
                </div>
                <p className="text-xs font-bold text-yellow-400">{sess.totalPoints} pts</p>
              </button>
            );
          })}
        </DashboardPanel>

        {gamePointsTrend.length > 1 && (
          <DashboardPanel title="Points Trend" className="lg:col-span-3">
            <ResponsiveContainer width="100%" height={165}>
              <LineChart data={gamePointsTrend} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                  labelStyle={{ color: "#f3f4f6" }}
                  itemStyle={{ color: "#d1d5db" }}
                />
                <Line type="monotone" dataKey="points" name="Points" stroke="#60a5fa" strokeWidth={2.5} dot={{ fill: "#60a5fa", r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </DashboardPanel>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   Player Lookup View
   ════════════════════════════════════════ */

function PlayerView({
  playerId,
  sessions,
  shots,
  navigate,
}: {
  playerId: string;
  sessions: GameSession[];
  shots: Shot[];
  navigate: (path: string) => void;
}) {
  const playerShots = shots.filter((s) => s.playerId === playerId);
  const playerSessions = sessions.filter((s) =>
    s.playerIds.includes(playerId)
  );

  if (playerShots.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-xl text-gray-400">
          No data found for <span className="text-white font-bold">"{playerId}"</span>
        </p>
        <p className="text-gray-500 text-sm mt-2">
          Check the ID and try again.
        </p>
      </div>
    );
  }

  // Zone data
  const zoneData: Record<number, { makes: number; misses: number }> = {};
  for (let z = 1; z <= 6; z++) zoneData[z] = { makes: 0, misses: 0 };
  for (const s of playerShots) {
    if (s.result === "make") zoneData[s.shotFrom].makes++;
    else zoneData[s.shotFrom].misses++;
  }

  const zonePoints: Record<number, number> = {};
  for (let z = 1; z <= 6; z++)
    zonePoints[z] = zoneData[z].makes * ZONE_POINTS[z];
  const zoneAccuracy: Record<number, number> = {};
  for (let z = 1; z <= 6; z++) {
    const total = zoneData[z].makes + zoneData[z].misses;
    zoneAccuracy[z] =
      total > 0 ? Math.round((zoneData[z].makes / total) * 100) : 0;
  }

  const zoneShotCounts: Record<number, number> = {};
  for (let z = 1; z <= 6; z++)
    zoneShotCounts[z] = zoneData[z].makes + zoneData[z].misses;
  const totalShots = playerShots.length;
  const totalMakes = playerShots.filter((s) => s.result === "make").length;
  const totalPoints = playerShots.reduce((sum, s) => sum + s.pointsEarned, 0);
  const accuracy =
    totalShots > 0 ? Math.round((totalMakes / totalShots) * 100) : 0;

  // Best zone
  let bestZone = 1;
  let bestZoneAcc = 0;
  for (let z = 1; z <= 6; z++) {
    const total = zoneData[z].makes + zoneData[z].misses;
    if (total >= 2 && zoneAccuracy[z] > bestZoneAcc) {
      bestZoneAcc = zoneAccuracy[z];
      bestZone = z;
    }
  }

  // Favorite zone (most shots)
  let favZone = 1;
  let favCount = 0;
  for (let z = 1; z <= 6; z++) {
    if (zoneShotCounts[z] > favCount) {
      favCount = zoneShotCounts[z];
      favZone = z;
    }
  }

  // Per-game trend
  const gameIds = [...new Set(playerShots.map((s) => s.gameId))];
  const gameTrend = gameIds
    .map((gid) => {
      const gShots = playerShots.filter((s) => s.gameId === gid);
      const pts = gShots.reduce((sum, s) => sum + s.pointsEarned, 0);
      const sess = sessions.find((s) => s.id === gid);
      return { gameId: gid, points: pts, time: sess?.startTime };
    })
    .sort((a, b) => {
      if (a.time && b.time) return a.time.toMillis() - b.time.toMillis();
      return 0;
    })
    .slice(-12);
  // Per-game accuracy trend
  const accTrend = gameIds
    .map((gid) => {
      const gShots = playerShots.filter((s) => s.gameId === gid);
      const makes = gShots.filter((s) => s.result === "make").length;
      const acc = gShots.length > 0 ? Math.round((makes / gShots.length) * 100) : 0;
      const sess = sessions.find((s) => s.id === gid);
      return { gameId: gid, accuracy: acc, time: sess?.startTime };
    })
    .sort((a, b) => {
      if (a.time && b.time) return a.time.toMillis() - b.time.toMillis();
      return 0;
    })
    .slice(-12);

  return (
    <div>
      {/* Player header */}
      <div className="text-center mb-2">
        <p className="text-xs text-gray-400">Lifetime stats for</p>
        <p className="text-xl font-bold">{playerId}</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-1.5 mb-2">
        <StatCard
          value={playerSessions.length}
          label="Games Played"
          color="text-blue-400"
        />
        <StatCard value={totalShots} label="Total Shots" color="text-white" />
        <StatCard
          value={`${accuracy}%`}
          label="Accuracy"
          color="text-green-400"
        />
        <StatCard
          value={totalPoints}
          label="Total Points"
          color="text-yellow-400"
        />
        <StatCard value={totalMakes} label="Makes" color="text-green-400" />
        <StatCard
          value={totalShots - totalMakes}
          label="Misses"
          color="text-red-400"
        />
        <StatCard
          value={totalShots > 0 ? (totalPoints / totalShots).toFixed(1) : "0"}
          label="Pts/Shot"
          color="text-orange-400"
        />
        <StatCard
          value={
            playerSessions.length > 0
              ? (totalPoints / playerSessions.length).toFixed(1)
              : "0"
          }
          label="Pts/Game"
          color="text-purple-400"
        />
      </div>

      <div className="grid gap-2 lg:grid-cols-12">
        <DashboardPanel title="Player Heatmap" className="lg:col-span-4">
          <div className="max-w-[220px] mx-auto">
            <BasketballCourtHeatMap
              shots={zoneDataToShots(zoneData)}
              title=""
              compact
              showLegend={false}
              showZoneStats={false}
              showQuickInsight={false}
              courtMaxWidthClass="max-w-[220px]"
            />
            <div className="flex items-center justify-center gap-2 mt-1 text-[10px] text-gray-400">
              <span>0%</span>
              <div
                className="h-2 w-16 rounded"
                style={{
                  background:
                    "linear-gradient(to right, hsl(0,80%,40%), hsl(40,90%,50%), hsl(140,70%,40%))",
                }}
              />
              <span>100%</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1 mt-2">
            <div className="bg-gray-800 rounded p-1 text-center">
              <p className="text-sm font-bold text-green-400">Z{bestZone}</p>
              <p className="text-[9px] text-gray-500">Best ({bestZoneAcc}%)</p>
            </div>
            <div className="bg-gray-800 rounded p-1 text-center">
              <p className="text-sm font-bold text-blue-400">Z{favZone}</p>
              <p className="text-[9px] text-gray-500">Fav ({favCount} shots)</p>
            </div>
          </div>
        </DashboardPanel>

        <DashboardPanel title="Zone Accuracy" className="lg:col-span-4">
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart
              data={[1, 2, 3, 4, 5, 6].map((z) => ({
                zone: `Zone ${z} (${ZONE_POINTS[z]}pt)`,
                accuracy: zoneAccuracy[z],
              }))}
            >
              <PolarGrid stroke="#374151" />
              <PolarAngleAxis dataKey="zone" tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <PolarRadiusAxis tick={{ fill: "#6b7280", fontSize: 10 }} domain={[0, 100]} />
              <Radar name="Accuracy %" dataKey="accuracy" stroke="#22c55e" fill="#22c55e" fillOpacity={0.25} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                labelStyle={{ color: "#f3f4f6" }}
                itemStyle={{ color: "#d1d5db" }}
                formatter={(value) => [`${value ?? 0}%`]}
              />
            </RadarChart>
          </ResponsiveContainer>
        </DashboardPanel>

        <DashboardPanel title="Zone Breakdown" className="lg:col-span-4">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={[1, 2, 3, 4, 5, 6].map((z) => ({
                zone: `Z${z}`,
                makes: zoneData[z].makes,
                misses: zoneData[z].misses,
                points: zonePoints[z],
              }))}
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="zone" tick={{ fill: "#9ca3af", fontSize: 10 }} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                labelStyle={{ color: "#f3f4f6" }}
                itemStyle={{ color: "#d1d5db" }}
              />
              <Legend wrapperStyle={{ fontSize: 10, color: "#9ca3af" }} />
              <Bar dataKey="makes" name="Makes" fill="#22c55e" radius={[4, 4, 0, 0]} stackId="shots" />
              <Bar dataKey="misses" name="Misses" fill="#ef4444" radius={[4, 4, 0, 0]} stackId="shots" />
            </BarChart>
          </ResponsiveContainer>
        </DashboardPanel>

        {gameTrend.length > 1 && (
          <DashboardPanel title="Performance Trend" className="lg:col-span-8">
            <ResponsiveContainer width="100%" height={170}>
              <LineChart
                data={gameTrend.map((g, i) => ({
                  game: `G${i + 1}`,
                  points: g.points,
                  accuracy: accTrend[i]?.accuracy ?? 0,
                }))}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="game" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <YAxis yAxisId="pts" tick={{ fill: "#6b7280", fontSize: 11 }} />
                <YAxis yAxisId="acc" orientation="right" domain={[0, 100]} tick={{ fill: "#6b7280", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                  labelStyle={{ color: "#f3f4f6" }}
                  itemStyle={{ color: "#d1d5db" }}
                  formatter={(value, name) => {
                    const safeValue = Number(value ?? 0);
                    if (String(name) === "Accuracy") return [`${safeValue}%`, "Accuracy"];
                    return [safeValue, String(name)];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af" }} />
                <Line yAxisId="pts" type="monotone" dataKey="points" name="Points" stroke="#eab308" strokeWidth={2} dot={{ fill: "#eab308", r: 4 }} activeDot={{ r: 6 }} />
                <Line yAxisId="acc" type="monotone" dataKey="accuracy" name="Accuracy" stroke="#06b6d4" strokeWidth={2} dot={{ fill: "#06b6d4", r: 4 }} activeDot={{ r: 6 }} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </DashboardPanel>
        )}

        <DashboardPanel title="Game History" className="lg:col-span-4" bodyClassName="space-y-1 overflow-y-auto max-h-[170px]">
          {playerSessions
            .slice(0, 10)
            .map((sess) => {
              const date = sess.startTime?.toDate?.();
              const dateStr = date
                ? date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "Unknown";
              const gShots = playerShots.filter(
                (s) => s.gameId === sess.id
              );
              const gPts = gShots.reduce(
                (sum, s) => sum + s.pointsEarned,
                0
              );
              const gMakes = gShots.filter(
                (s) => s.result === "make"
              ).length;
              const gAcc =
                gShots.length > 0
                  ? Math.round((gMakes / gShots.length) * 100)
                  : 0;
              return (
                <button
                  key={sess.id}
                  onClick={() => navigate(`/stats/${sess.id}`)}
                  className="w-full bg-gray-800 rounded-xl p-3 flex items-center justify-between text-left transition-colors hover:bg-gray-700"
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
                        {sess.activityType === "team"
                          ? "Team"
                          : "Individual"}
                      </span>{" "}
                      <span className="text-gray-500">&middot;</span>{" "}
                      <span className="text-gray-300">{gAcc}% acc</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {dateStr}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-yellow-400">
                      {gPts} pts
                    </p>
                    <p className="text-xs text-gray-500">
                      {gMakes}/{gShots.length} makes
                    </p>
                  </div>
                </button>
              );
            })}
        </DashboardPanel>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   Shared Components
   ════════════════════════════════════════ */

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
    <div className="bg-gray-800 rounded-lg p-2 text-center">
      <p className={`text-lg font-bold leading-tight ${color}`}>{value}</p>
      <p className="text-[11px] text-gray-400">{label}</p>
    </div>
  );
}

function DashboardPanel({
  title,
  className = "",
  bodyClassName = "",
  children,
}: {
  title: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={`bg-gray-900/75 border border-gray-800 rounded-xl p-3 ${className}`}>
      <h2 className="text-sm font-semibold text-gray-200 mb-1.5 tracking-wide">{title}</h2>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
