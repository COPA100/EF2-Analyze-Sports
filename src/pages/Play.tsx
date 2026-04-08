import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  updateDoc,
  deleteDoc,
  writeBatch,
  Timestamp,
  increment,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { getPointsForZone, getNextPlayer, ZONE_POINTS } from "../lib/scoring";
import type { GameSession, Shot } from "../types";
import BasketballCourtHeatMap from "../components/BasketballCourtHeatMap";
import ZoneGrid from "../components/ZoneGrid";

interface GameState {
  session: GameSession;
  shots: Shot[];
  currentPlayerId: string;
  currentTeam: "team1" | "team2" | null;
  teamRotationIndex: { team1: number; team2: number };
}

// localStorage helpers for mid-game persistence across reloads
function saveGameToLocal(gameId: string, state: GameState) {
  try {
    localStorage.setItem(
      `game_${gameId}`,
      JSON.stringify({
        session: state.session,
        shots: state.shots,
        currentPlayerId: state.currentPlayerId,
        currentTeam: state.currentTeam,
        teamRotationIndex: state.teamRotationIndex,
        savedAt: Date.now(),
      })
    );
  } catch {
    // localStorage full or unavailable — not critical
  }
}

function loadGameFromLocal(gameId: string): GameState | null {
  try {
    const raw = localStorage.getItem(`game_${gameId}`);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Expire after 24 hours
    if (Date.now() - data.savedAt > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(`game_${gameId}`);
      return null;
    }
    return {
      session: data.session,
      shots: data.shots,
      currentPlayerId: data.currentPlayerId,
      currentTeam: data.currentTeam,
      teamRotationIndex: data.teamRotationIndex,
    };
  } catch {
    return null;
  }
}

function clearGameFromLocal(gameId: string) {
  try {
    localStorage.removeItem(`game_${gameId}`);
  } catch {
    // ignore
  }
}

export default function Play() {
  const { gameId } = useParams<{ gameId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [selectedZone, setSelectedZone] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Compute last zone from shots
  const lastZone =
    gameState && gameState.shots.length > 0
      ? gameState.shots[gameState.shots.length - 1].shotFrom
      : null;

  // Compute disabled zone for individual (can't shoot same zone twice in a row)
  const disabledZone =
    gameState?.session.activityType === "individual" ? lastZone : null;

  // Only individual play blocks the last zone; team play has no zone restrictions
  const effectiveDisabledZone = disabledZone;

  const initFromState = useCallback(
    (session: GameSession, shots: Shot[]) => {
      if (session.activityType === "individual") {
        setGameState({
          session,
          shots,
          currentPlayerId: session.playerIds[0],
          currentTeam: null,
          teamRotationIndex: { team1: 0, team2: 0 },
        });
      } else if (session.teams) {
        // Reconstruct team rotation from shot history
        let lastTeam: "team1" | "team2" | null = null;
        const rotIdx = { team1: 0, team2: 0 };

        if (shots.length > 0) {
          const lastShot = shots[shots.length - 1];
          lastTeam = session.teams.team1.includes(lastShot.playerId)
            ? "team1"
            : "team2";
        }

        const next = getNextPlayer(session.teams, shots, lastTeam, rotIdx);
        setGameState({
          session,
          shots,
          currentPlayerId: next.playerId,
          currentTeam: next.team,
          teamRotationIndex: next.rotationIndex,
        });
      }
    },
    []
  );

  // Initialize game state
  useEffect(() => {
    async function init() {
      setLoading(true);

      if (!gameId) return;

      // 1. Try localStorage first (instant recovery on reload)
      const local = loadGameFromLocal(gameId);
      if (local && local.shots.length > 0) {
        setGameState(local);
        setLoading(false);
        return;
      }

      // 2. Try router state (fresh navigation from Setup)
      const navState = location.state as { gameSession?: GameSession } | null;
      if (navState?.gameSession) {
        initFromState(navState.gameSession, []);
        setLoading(false);
        return;
      }

      // 3. Fallback: read from Firestore
      try {
        const sessionDoc = await getDoc(doc(db, "gameSessions", gameId));
        if (!sessionDoc.exists()) {
          setError("Game not found.");
          setLoading(false);
          return;
        }
        const session = { id: sessionDoc.id, ...sessionDoc.data() } as GameSession;

        const shotsQuery = query(
          collection(db, "shots"),
          where("gameId", "==", gameId),
          orderBy("shotNumber", "asc")
        );
        const shotsSnap = await getDocs(shotsQuery);
        const shots = shotsSnap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as Shot
        );

        initFromState(session, shots);
      } catch (e) {
        setError("Failed to load game. Try refreshing.");
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [gameId, location.state, initFromState]);

  // Persist game state to localStorage on every change
  useEffect(() => {
    if (gameState && gameId) {
      saveGameToLocal(gameId, gameState);
    }
  }, [gameState, gameId]);

  // Check if game is over
  useEffect(() => {
    if (!gameState || !gameId) return;
    const { session, shots } = gameState;
    let isOver = false;
    if (session.activityType === "individual" && shots.length >= 20) {
      isOver = true;
    } else if (session.activityType === "team") {
      const team1Shots = shots.filter((s) =>
        session.teams!.team1.includes(s.playerId)
      ).length;
      const team2Shots = shots.filter((s) =>
        session.teams!.team2.includes(s.playerId)
      ).length;
      if (team1Shots >= 30 && team2Shots >= 30) {
        isOver = true;
      }
    }
    if (isOver) {
      clearGameFromLocal(gameId);
      // Mark session as completed in Firestore
      updateDoc(doc(db, "gameSessions", gameId), {
        isCompleted: true,
        endTime: Timestamp.now(),
      }).catch((e) => console.error("Failed to mark game completed:", e));
      navigate(`/stats/${gameId}`, { replace: true });
    }
  }, [gameState, gameId, navigate]);

  async function recordShot(result: "make" | "miss") {
    if (!gameState || !selectedZone || saving || !gameId) return;
    setSaving(true);
    setError("");

    const points = result === "make" ? getPointsForZone(selectedZone) : 0;
    const shotNumber = gameState.shots.length + 1;

    const shotData = {
      gameId,
      playerId: gameState.currentPlayerId,
      activityType: gameState.session.activityType,
      shotFrom: selectedZone,
      result,
      pointsEarned: points,
      shotNumber,
      timestamp: Timestamp.now(),
    };

    try {
      const batch = writeBatch(db);
      const shotRef = doc(collection(db, "shots"));
      batch.set(shotRef, shotData);
      batch.update(doc(db, "gameSessions", gameId), {
        totalShots: increment(1),
        totalPoints: increment(points),
      });
      await batch.commit();

      const newShot: Shot = { ...shotData, id: shotRef.id } as Shot;
      const newShots = [...gameState.shots, newShot];
      const newSession = {
        ...gameState.session,
        totalShots: gameState.session.totalShots + 1,
        totalPoints: gameState.session.totalPoints + points,
      };

      // Advance turn
      if (gameState.session.activityType === "team" && gameState.session.teams) {
        const next = getNextPlayer(
          gameState.session.teams,
          newShots,
          gameState.currentTeam,
          gameState.teamRotationIndex
        );
        setGameState({
          session: newSession,
          shots: newShots,
          currentPlayerId: next.playerId,
          currentTeam: next.team,
          teamRotationIndex: next.rotationIndex,
        });
      } else {
        setGameState({
          ...gameState,
          session: newSession,
          shots: newShots,
        });
      }
      setSelectedZone(null);
    } catch (e) {
      setError("Shot not saved — tap to retry.");
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function undoLastShot() {
    if (!gameState || gameState.shots.length === 0 || saving || !gameId) return;
    setSaving(true);
    setError("");

    const lastShot = gameState.shots[gameState.shots.length - 1];
    try {
      if (lastShot.id) {
        await deleteDoc(doc(db, "shots", lastShot.id));
        await updateDoc(doc(db, "gameSessions", gameId), {
          totalShots: increment(-1),
          totalPoints: increment(-lastShot.pointsEarned),
        });
      }

      const newShots = gameState.shots.slice(0, -1);
      const newSession = {
        ...gameState.session,
        totalShots: gameState.session.totalShots - 1,
        totalPoints: gameState.session.totalPoints - lastShot.pointsEarned,
      };

      // Re-derive turn
      if (gameState.session.activityType === "team" && gameState.session.teams) {
        let lastTeam: "team1" | "team2" | null = null;
        if (newShots.length > 0) {
          const prev = newShots[newShots.length - 1];
          lastTeam = gameState.session.teams.team1.includes(prev.playerId)
            ? "team1"
            : "team2";
        }
        const next = getNextPlayer(
          gameState.session.teams,
          newShots,
          lastTeam,
          { team1: 0, team2: 0 }
        );
        setGameState({
          session: newSession,
          shots: newShots,
          currentPlayerId: next.playerId,
          currentTeam: next.team,
          teamRotationIndex: next.rotationIndex,
        });
      } else {
        setGameState({
          ...gameState,
          session: newSession,
          shots: newShots,
        });
      }
      setSelectedZone(null);
    } catch (e) {
      setError("Failed to undo. Try again.");
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-xl">Loading game...</p>
      </div>
    );
  }

  if (error && !gameState) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-4">
        <p className="text-red-400 text-xl">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-xl font-semibold"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!gameState) return null;

  const { session, shots } = gameState;
  const isTeam = session.activityType === "team";

  // Shot counters
  let shotDisplay: string;
  if (isTeam && session.teams) {
    const t1 = shots.filter((s) => session.teams!.team1.includes(s.playerId)).length;
    const t2 = shots.filter((s) => session.teams!.team2.includes(s.playerId)).length;
    shotDisplay = `Team 1: ${t1}/30  |  Team 2: ${t2}/30`;
  } else {
    shotDisplay = `Shot ${shots.length + 1} of 20`;
  }

  // Data collection UI (shared between individual and team)
  const dataCollectionUI = (
    <div className="flex flex-col items-center w-full">
      {/* Header */}
      <div className="w-full max-w-md mb-4">
        <div className="text-center">
          {isTeam && gameState.currentTeam && (
            <p
              className={`text-lg font-semibold ${
                gameState.currentTeam === "team1"
                  ? "text-blue-400"
                  : "text-orange-400"
              }`}
            >
              {gameState.currentTeam === "team1" ? "Team 1" : "Team 2"}
            </p>
          )}
          <p className="text-2xl font-bold">{gameState.currentPlayerId}'s turn</p>
          <p className="text-gray-400 mt-1">{shotDisplay}</p>
          {/* Progress bar */}
          {isTeam && session.teams ? (
            <div className="mt-3 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-blue-400 w-10">T1</span>
                <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-500 h-full rounded-full transition-all"
                    style={{ width: `${(shots.filter(s => session.teams!.team1.includes(s.playerId)).length / 30) * 100}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-orange-400 w-10">T2</span>
                <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-orange-500 h-full rounded-full transition-all"
                    style={{ width: `${(shots.filter(s => session.teams!.team2.includes(s.playerId)).length / 30) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-3 bg-gray-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-500 h-full rounded-full transition-all"
                style={{ width: `${(shots.length / 20) * 100}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Error toast */}
      {error && (
        <p className="text-red-400 mb-2 text-sm">{error}</p>
      )}

      {/* Zone Grid */}
      <div className="w-full max-w-md">
        <BasketballCourtHeatMap
          shots={[]}
          onZoneClick={(zone) => setSelectedZone(Number(zone))}
          selectedZone={selectedZone?.toString() ?? null}
          disabledZone={effectiveDisabledZone?.toString() ?? null}
          title=""
          compact
          showLegend={false}
          showZoneStats={false}
          showQuickInsight={false}
          courtMaxWidthClass="max-w-md"
        />
      </div>

      {/* Make / Miss buttons */}
      <div className="flex gap-4 mt-6 w-full max-w-md">
        <button
          onClick={() => recordShot("make")}
          disabled={!selectedZone || saving}
          className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xl font-bold py-4 rounded-xl transition-colors"
        >
          {saving ? "..." : "Make"}
        </button>
        <button
          onClick={() => recordShot("miss")}
          disabled={!selectedZone || saving}
          className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xl font-bold py-4 rounded-xl transition-colors"
        >
          {saving ? "..." : "Miss"}
        </button>
      </div>

      {/* Undo button */}
      <button
        onClick={undoLastShot}
        disabled={shots.length === 0 || saving}
        className="mt-4 text-gray-400 hover:text-white disabled:text-gray-700 text-sm underline transition-colors"
      >
        Undo last shot
      </button>
    </div>
  );

  // Individual play: centered layout (unchanged)
  if (!isTeam || !session.teams) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center p-4">
        {dataCollectionUI}
      </div>
    );
  }

  // Team play: 3-column layout with live stat panels
  return (
    <div className="min-h-screen bg-gray-950 text-white p-3">
      <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-3 items-start max-lg:flex max-lg:flex-col max-lg:items-center">
        {/* Left: Team 1 Stats */}
        <TeamLivePanel
          teamName="Team 1"
          teamColor="blue"
          players={session.teams.team1}
          shots={shots}
          teamPlayers={session.teams.team1}
          isActive={gameState.currentTeam === "team1"}
        />

        {/* Center: Data Collection */}
        <div className="w-full max-w-md">
          {dataCollectionUI}
        </div>

        {/* Right: Team 2 Stats */}
        <TeamLivePanel
          teamName="Team 2"
          teamColor="orange"
          players={session.teams.team2}
          shots={shots}
          teamPlayers={session.teams.team2}
          isActive={gameState.currentTeam === "team2"}
        />
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   Team Live Stats Panel
   ════════════════════════════════════════ */

function TeamLivePanel({
  teamName,
  teamColor,
  players,
  shots,
  teamPlayers,
  isActive,
}: {
  teamName: string;
  teamColor: "blue" | "orange";
  players: string[];
  shots: Shot[];
  teamPlayers: string[];
  isActive: boolean;
}) {
  // Filter shots for this team
  const teamShots = shots.filter((s) => teamPlayers.includes(s.playerId));
  const totalShots = teamShots.length;
  const makes = teamShots.filter((s) => s.result === "make").length;
  const misses = totalShots - makes;
  const points = teamShots.reduce((sum, s) => sum + s.pointsEarned, 0);
  const accuracy = totalShots > 0 ? Math.round((makes / totalShots) * 100) : 0;

  // Zone data for heatmap
  const zoneData: Record<number, { makes: number; misses: number }> = {};
  for (let z = 1; z <= 6; z++) zoneData[z] = { makes: 0, misses: 0 };
  for (const s of teamShots) {
    if (s.result === "make") zoneData[s.shotFrom].makes++;
    else zoneData[s.shotFrom].misses++;
  }

  // Per-player stats
  const playerStats = players.map((id) => {
    const pShots = teamShots.filter((s) => s.playerId === id);
    const pMakes = pShots.filter((s) => s.result === "make").length;
    const pPoints = pShots.reduce((sum, s) => sum + s.pointsEarned, 0);
    return { id, shots: pShots.length, makes: pMakes, points: pPoints };
  });

  // Best zone
  let bestZone = 0;
  let bestZoneAcc = 0;
  for (let z = 1; z <= 6; z++) {
    const total = zoneData[z].makes + zoneData[z].misses;
    if (total > 0) {
      const acc = zoneData[z].makes / total;
      if (acc > bestZoneAcc) {
        bestZoneAcc = acc;
        bestZone = z;
      }
    }
  }

  const borderColor = teamColor === "blue" ? "border-blue-500/40" : "border-orange-500/40";
  const headerBg = teamColor === "blue" ? "bg-blue-500/15" : "bg-orange-500/15";
  const accentText = teamColor === "blue" ? "text-blue-400" : "text-orange-400";
  const activeBorder = isActive
    ? (teamColor === "blue" ? "border-blue-400" : "border-orange-400")
    : "border-gray-800";

  return (
    <div className={`bg-gray-900/75 border-2 ${activeBorder} rounded-xl p-3 w-full max-w-xs max-lg:max-w-md transition-colors`}>
      {/* Team Header */}
      <div className={`${headerBg} rounded-lg px-3 py-2 mb-3 text-center`}>
        <h2 className={`text-base font-bold ${accentText}`}>{teamName}</h2>
        <div className="flex justify-center gap-4 mt-1">
          <span className="text-lg font-bold text-yellow-400">{points} <span className="text-xs text-gray-400 font-normal">pts</span></span>
          <span className="text-lg font-bold text-green-400">{accuracy}% <span className="text-xs text-gray-400 font-normal">acc</span></span>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        <div className="bg-gray-800 rounded-lg p-1.5 text-center">
          <p className="text-sm font-bold text-green-400">{makes}</p>
          <p className="text-[10px] text-gray-500">Makes</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-1.5 text-center">
          <p className="text-sm font-bold text-red-400">{misses}</p>
          <p className="text-[10px] text-gray-500">Misses</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-1.5 text-center">
          <p className="text-sm font-bold text-gray-300">{totalShots}/30</p>
          <p className="text-[10px] text-gray-500">Shots</p>
        </div>
      </div>

      {/* Zone Heatmap Grid */}
      <div className="mb-3">
        <p className="text-[10px] text-gray-500 mb-1 text-center uppercase tracking-wide">Zone Heatmap</p>
        <div className="[&_.grid]:!max-w-none [&_.grid]:!aspect-auto [&_.grid_.col-span-6]:!min-h-[36px] [&_.grid_.col-span-3]:!min-h-[36px] [&_.grid_.col-span-2]:!min-h-[36px] [&_.grid_.text-2xl]:!text-xs [&_.grid_.text-sm]:!text-[9px] [&_.grid_.text-xs]:!text-[8px]">
          <ZoneGrid mode="heatmap" zoneData={zoneData} />
        </div>
        <div className="flex items-center justify-center gap-1.5 mt-1 text-[9px] text-gray-500">
          <span>0%</span>
          <div className="h-1.5 w-16 rounded" style={{ background: "linear-gradient(to right, hsl(0,80%,40%), hsl(40,90%,50%), hsl(140,70%,40%))" }} />
          <span>100%</span>
        </div>
      </div>

      {/* Best Zone */}
      {bestZone > 0 && (
        <div className={`bg-gray-800 rounded-lg px-2 py-1.5 mb-3 text-center border ${borderColor}`}>
          <p className="text-[10px] text-gray-500">Best Zone</p>
          <p className={`text-sm font-bold ${accentText}`}>Zone {bestZone} <span className="text-gray-400 font-normal">({ZONE_POINTS[bestZone]}pt)</span> — {Math.round(bestZoneAcc * 100)}%</p>
        </div>
      )}

      {/* Player Breakdown */}
      <div>
        <p className="text-[10px] text-gray-500 mb-1 text-center uppercase tracking-wide">Players</p>
        <div className="space-y-1">
          {playerStats.map((p) => {
            const pAcc = p.shots > 0 ? Math.round((p.makes / p.shots) * 100) : 0;
            return (
              <div key={p.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-2 py-1.5">
                <span className="text-xs font-medium text-gray-200 truncate mr-2">{p.id}</span>
                <div className="flex items-center gap-2 text-[10px] shrink-0">
                  <span className="text-yellow-400 font-bold">{p.points}pt</span>
                  <span className="text-gray-400">{p.makes}/{p.shots}</span>
                  <span className={`font-medium ${pAcc >= 50 ? "text-green-400" : p.shots > 0 ? "text-red-400" : "text-gray-600"}`}>{pAcc}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
