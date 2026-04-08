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
  const [teamPanelSelectedPlayer, setTeamPanelSelectedPlayer] = useState<{
    team1: string | null;
    team2: string | null;
  }>({ team1: null, team2: null });

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
    <div className="flex flex-col items-center w-full max-w-md mx-auto">
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
          <p className="text-3xl font-bold">{gameState.currentPlayerId}'s turn</p>
          <p className="text-gray-400 text-lg mt-1">{shotDisplay}</p>
          {/* Progress bar */}
          {isTeam && session.teams ? (
            <div className="mt-3 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm text-blue-400 w-12">T1</span>
                <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-500 h-full rounded-full transition-all"
                    style={{ width: `${(shots.filter(s => session.teams!.team1.includes(s.playerId)).length / 30) * 100}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-orange-400 w-12">T2</span>
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
        <p className="text-red-400 mb-2 text-base">{error}</p>
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
          className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-2xl font-bold py-5 rounded-xl transition-colors"
        >
          {saving ? "..." : "Make"}
        </button>
        <button
          onClick={() => recordShot("miss")}
          disabled={!selectedZone || saving}
          className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-2xl font-bold py-5 rounded-xl transition-colors"
        >
          {saving ? "..." : "Miss"}
        </button>
      </div>

      {/* Undo button */}
      <button
        onClick={undoLastShot}
        disabled={shots.length === 0 || saving}
        className="mt-5 text-gray-400 hover:text-white disabled:text-gray-700 text-base underline transition-colors"
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
    <div className="min-h-screen bg-gray-950 text-white p-2 lg:p-3 overflow-x-hidden flex items-center justify-center">
      <div className="w-full max-w-336 flex flex-col lg:flex-row gap-2 lg:gap-3 items-stretch justify-center">
        {/* Left: Team 1 Stats */}
        <div className="w-full lg:w-md shrink-0 order-2 lg:order-1 lg:min-h-176 flex flex-col">
          {teamPanelSelectedPlayer.team1 && (
            <button
              type="button"
              onClick={() =>
                setTeamPanelSelectedPlayer((prev) => ({ ...prev, team1: null }))
              }
              className="self-start mb-2 text-sm text-gray-300 hover:text-white underline underline-offset-2"
            >
              ← Back to Team 1 stats
            </button>
          )}
          <TeamLivePanel
            teamName="Team 1"
            teamColor="blue"
            players={session.teams.team1}
            shots={shots}
            teamPlayers={session.teams.team1}
            isActive={gameState.currentTeam === "team1"}
            selectedPlayerId={teamPanelSelectedPlayer.team1}
            onSelectPlayer={(playerId) =>
              setTeamPanelSelectedPlayer((prev) => ({ ...prev, team1: playerId }))
            }
          />
        </div>

        {/* Center: Data Collection */}
        <div className="w-full lg:w-md shrink-0 order-1 lg:order-2 lg:min-h-176 flex items-center">
          {dataCollectionUI}
        </div>

        {/* Right: Team 2 Stats */}
        <div className="w-full lg:w-md shrink-0 order-3 lg:min-h-176 flex flex-col">
          {teamPanelSelectedPlayer.team2 && (
            <button
              type="button"
              onClick={() =>
                setTeamPanelSelectedPlayer((prev) => ({ ...prev, team2: null }))
              }
              className="self-start mb-2 text-sm text-gray-300 hover:text-white underline underline-offset-2"
            >
              ← Back to Team 2 stats
            </button>
          )}
          <TeamLivePanel
            teamName="Team 2"
            teamColor="orange"
            players={session.teams.team2}
            shots={shots}
            teamPlayers={session.teams.team2}
            isActive={gameState.currentTeam === "team2"}
            selectedPlayerId={teamPanelSelectedPlayer.team2}
            onSelectPlayer={(playerId) =>
              setTeamPanelSelectedPlayer((prev) => ({ ...prev, team2: playerId }))
            }
          />
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   Team Live Stats Panel
   ════════════════════════════════════════ */

function getZoneHeatmapStyle(
  makes: number,
  misses: number
): React.CSSProperties | null {
  const total = makes + misses;
  if (total === 0) return null;

  const accuracy = makes / total;
  let hue: number;
  let sat: number;
  let light: number;

  // Match dashboard gradient behavior: red -> yellow -> green continuously.
  if (accuracy <= 0.5) {
    const t = accuracy / 0.5;
    hue = t * 40;
    sat = 80 + t * 10;
    light = 40 + t * 10;
  } else {
    const t = (accuracy - 0.5) / 0.5;
    hue = 40 + t * 100;
    sat = 90 - t * 20;
    light = 50 - t * 10;
  }

  return { backgroundColor: `hsl(${hue}, ${sat}%, ${light}%)` };
}

function getGradientColorFromRatio(ratio: number, alpha = 1): string {
  const normalized = Math.max(0, Math.min(ratio, 1));
  let hue: number;
  let sat: number;
  let light: number;

  if (normalized <= 0.5) {
    const t = normalized / 0.5;
    hue = t * 40;
    sat = 80 + t * 10;
    light = 40 + t * 10;
  } else {
    const t = (normalized - 0.5) / 0.5;
    hue = 40 + t * 100;
    sat = 90 - t * 20;
    light = 50 - t * 10;
  }

  return `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`;
}

function getGradientRatioFromCounts(makes: number, misses: number): number {
  const total = makes + misses;
  if (total === 0) return 0;
  return makes / total;
}

function TeamLivePanel({
  teamName,
  teamColor,
  players,
  shots,
  teamPlayers,
  isActive,
  selectedPlayerId,
  onSelectPlayer,
}: {
  teamName: string;
  teamColor: "blue" | "orange";
  players: string[];
  shots: Shot[];
  teamPlayers: string[];
  isActive: boolean;
  selectedPlayerId: string | null;
  onSelectPlayer: (playerId: string | null) => void;
}) {
  useEffect(() => {
    if (selectedPlayerId && !players.includes(selectedPlayerId)) {
      onSelectPlayer(null);
    }
  }, [players, selectedPlayerId, onSelectPlayer]);

  // Filter shots for this team
  const teamShots = shots.filter((s) => teamPlayers.includes(s.playerId));
  const viewedShots = selectedPlayerId
    ? teamShots.filter((s) => s.playerId === selectedPlayerId)
    : teamShots;

  const totalShots = viewedShots.length;
  const makes = viewedShots.filter((s) => s.result === "make").length;
  const misses = totalShots - makes;
  const points = viewedShots.reduce((sum, s) => sum + s.pointsEarned, 0);
  const accuracy = totalShots > 0 ? Math.round((makes / totalShots) * 100) : 0;

  // Zone data
  const zoneData: Record<number, { makes: number; misses: number }> = {};
  for (let z = 1; z <= 6; z++) zoneData[z] = { makes: 0, misses: 0 };
  for (const s of viewedShots) {
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

  const rankedPlayerStats = [...playerStats].sort(
    (a, b) => b.points - a.points || b.makes - a.makes || a.id.localeCompare(b.id)
  );

  const selectedPlayerStats = selectedPlayerId
    ? playerStats.find((p) => p.id === selectedPlayerId) ?? null
    : null;

  const makesRatio = getGradientRatioFromCounts(makes, misses);

  const headerBg = teamColor === "blue" ? "bg-blue-500/15" : "bg-orange-500/15";
  const accentText = teamColor === "blue" ? "text-blue-400" : "text-orange-400";
  const activeBorder = isActive
    ? (teamColor === "blue" ? "border-blue-400" : "border-orange-400")
    : "border-gray-800";

  return (
    <div className={`bg-gray-900/75 border-2 ${activeBorder} rounded-xl p-4 lg:p-5 w-full h-full transition-colors flex flex-col`}>
      {/* Team Header */}
      <div className={`${headerBg} rounded-lg px-4 py-3 mb-4 text-center`}>
        <h2 className={`text-xl font-bold ${accentText}`}>
          {selectedPlayerId ? `Player ${selectedPlayerId}` : teamName}
        </h2>
        {selectedPlayerId && (
          <p className="text-sm text-gray-400 mt-0.5">{teamName} player view</p>
        )}
        <div className="flex justify-center gap-5 mt-1">
          <span className="text-2xl font-bold text-yellow-400">
            {points} <span className="text-sm text-gray-400 font-normal">pts</span>
          </span>
          <span className="text-2xl font-bold" style={{ color: getGradientColorFromRatio(makesRatio) }}>
            {accuracy}% <span className="text-sm text-gray-400 font-normal">acc</span>
          </span>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-gray-800 rounded-md px-2 py-2.5 text-center">
          <p className="text-xl font-bold text-green-400">{makes}</p>
          <p className="text-sm text-gray-500">Makes</p>
        </div>
        <div className="bg-gray-800 rounded-md px-2 py-2.5 text-center">
          <p className="text-xl font-bold text-red-400">{misses}</p>
          <p className="text-sm text-gray-500">Misses</p>
        </div>
        <div className="bg-gray-800 rounded-md px-2 py-2.5 text-center">
          <p className="text-xl font-bold text-gray-300">{totalShots}/30</p>
          <p className="text-sm text-gray-500">Shots</p>
        </div>
      </div>

      {/* Compact Zone Heatmap — built inline, not using ZoneGrid */}
      <div className="mb-4">
        <p className="text-sm text-gray-500 mb-2 text-center uppercase tracking-wide">Zone Breakdown</p>
        <div className="grid grid-cols-6 gap-2">
          {/* Zone 1 - top, spans all 6 */}
          <CompactZone zone={1} data={zoneData[1]} className="col-span-6" />
          {/* Zone 2 - mid left, spans 3 */}
          <CompactZone zone={2} data={zoneData[2]} className="col-span-3" />
          {/* Zone 3 - mid right, spans 3 */}
          <CompactZone zone={3} data={zoneData[3]} className="col-span-3" />
          {/* Zone 4,5,6 - bottom, 2 each */}
          <CompactZone zone={4} data={zoneData[4]} className="col-span-2" />
          <CompactZone zone={5} data={zoneData[5]} className="col-span-2" />
          <CompactZone zone={6} data={zoneData[6]} className="col-span-2" />
        </div>
        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-gray-500">
          <span>Miss-Heavy</span>
          <span
            className="inline-block h-3 w-20 rounded border border-gray-700"
            style={{
              background:
                "linear-gradient(90deg, #ef4444 0%, #facc15 50%, #22c55e 100%)",
            }}
          />
          <span>Make-Heavy</span>
        </div>
      </div>

      {/* Bottom Section */}
      {selectedPlayerId ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <p className="text-sm text-gray-500 mb-2 text-center uppercase tracking-wide">
            Player Snapshot
          </p>
          <div className="bg-gray-800/60 border border-gray-700 rounded-md px-3 py-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-gray-800 rounded-md p-2 text-center">
                <p className="text-gray-400 text-xs">Attempts</p>
                <p className="text-white text-xl font-bold">{selectedPlayerStats?.shots ?? 0}</p>
              </div>
              <div className="bg-gray-800 rounded-md p-2 text-center">
                <p className="text-gray-400 text-xs">Makes</p>
                <p className="text-green-400 text-xl font-bold">{selectedPlayerStats?.makes ?? 0}</p>
              </div>
              <div className="bg-gray-800 rounded-md p-2 text-center">
                <p className="text-gray-400 text-xs">Misses</p>
                <p className="text-red-400 text-xl font-bold">{Math.max((selectedPlayerStats?.shots ?? 0) - (selectedPlayerStats?.makes ?? 0), 0)}</p>
              </div>
              <div className="bg-gray-800 rounded-md p-2 text-center">
                <p className="text-gray-400 text-xs">Points</p>
                <p className="text-yellow-400 text-xl font-bold">{selectedPlayerStats?.points ?? 0}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          <p className="text-sm text-gray-500 mb-2 text-center uppercase tracking-wide">Players</p>
          <div className="bg-gray-800/60 border border-gray-700 rounded-md px-2 py-2 flex-1 min-h-0 flex flex-col">
            <div className="flex items-center text-xs text-gray-400 font-semibold pb-2 border-b border-gray-700">
              <span className="w-8 shrink-0">#</span>
              <span className="flex-1">Player</span>
              <span className="w-14 text-right shrink-0">Pts</span>
              <span className="w-16 text-right shrink-0">M/A</span>
              <span className="w-14 text-right shrink-0">Acc</span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto pr-1 mt-1.5 space-y-1">
              {rankedPlayerStats.map((p, index) => {
                const pAcc = p.shots > 0 ? Math.round((p.makes / p.shots) * 100) : 0;
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => onSelectPlayer(p.id)}
                    className="w-full flex items-center bg-gray-800 hover:bg-gray-700 rounded-md px-2 py-2 text-sm text-left transition-colors"
                  >
                    <span className="w-8 shrink-0 text-gray-400 font-semibold">{index + 1}</span>
                    <span className="flex-1 text-base font-medium text-gray-200 truncate mr-2">{p.id}</span>
                    <span className="w-14 text-right text-yellow-400 font-bold shrink-0">{p.points}</span>
                    <span className="w-16 text-right text-gray-400 shrink-0">{p.makes}/{p.shots}</span>
                    <span
                      className="w-14 text-right font-semibold shrink-0"
                      style={{ color: getGradientColorFromRatio(pAcc / 100) }}
                    >
                      {pAcc}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* Compact zone cell for the live panel heatmap */
function CompactZone({
  zone,
  data,
  className = "",
}: {
  zone: number;
  data: { makes: number; misses: number };
  className?: string;
}) {
  const total = data.makes + data.misses;
  const acc = total > 0 ? Math.round((data.makes / total) * 100) : 0;
  const heatStyle = getZoneHeatmapStyle(data.makes, data.misses);

  return (
    <div
      className={`${heatStyle ? "" : "bg-gray-800"} rounded-md px-2 py-2.5 text-center border border-gray-700/50 ${className}`}
      style={heatStyle ?? undefined}
    >
      <p className="text-sm font-bold text-white">
        Z{zone} <span className="text-xs font-normal text-white/80">({ZONE_POINTS[zone]}pt)</span>
      </p>
      <p className="text-xs mt-0.5 text-white/90">
        {total > 0 ? `${data.makes}/${total} · ${acc}%` : "—"}
      </p>
    </div>
  );
}
