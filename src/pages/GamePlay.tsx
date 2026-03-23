import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { subscribeToGameSession, subscribeToShots, recordShot, completeGame } from '../lib/firebase';
import { getMaxShots, ZONE_POINTS, TEAM_PLAYER_MAX_SHOTS, TEAM_PLAYER_MIN_SHOTS } from '../lib/scoring';
import type { GameSession, Shot, ShotResult, TeamKey } from '../types';
import ZoneGrid from '../components/ZoneGrid';
import TopBar from '../components/TopBar';
import Toast from '../components/Toast';

export default function GamePlay() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();

  const [game, setGame] = useState<GameSession | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [selectedZone, setSelectedZone] = useState<number | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<string>('');
  const [activeTeam, setActiveTeam] = useState<TeamKey>('a');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' | 'warning' } | null>(null);
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);

  // Subscribe to real-time data
  useEffect(() => {
    if (!gameId) return;
    const unsub1 = subscribeToGameSession(gameId, setGame);
    const unsub2 = subscribeToShots(gameId, setShots);
    return () => { unsub1(); unsub2(); };
  }, [gameId]);

  // Set initial current player
  useEffect(() => {
    if (game && !currentPlayer) {
      if (game.teams) {
        const teamPlayers = game.teams[activeTeam];
        if (teamPlayers.length > 0) setCurrentPlayer(teamPlayers[0]);
      } else if (game.playerIds.length > 0) {
        setCurrentPlayer(game.playerIds[0]);
      }
    }
  }, [game, currentPlayer, activeTeam]);

  // Redirect if game is completed
  useEffect(() => {
    if (game?.isCompleted) {
      navigate(`/analysis/${gameId}`, { replace: true });
    }
  }, [game?.isCompleted, gameId, navigate]);

  const isTeam = game?.activityType === 'team';
  const maxShots = game ? getMaxShots(game.activityType) : 0;

  // Team-aware shot counts
  const teamAPlayers = game?.teams?.a ?? [];
  const teamBPlayers = game?.teams?.b ?? [];
  const activeTeamPlayers = isTeam ? (activeTeam === 'a' ? teamAPlayers : teamBPlayers) : game?.playerIds ?? [];

  const teamAShots = shots.filter((s) => teamAPlayers.includes(s.playerId));
  const teamBShots = shots.filter((s) => teamBPlayers.includes(s.playerId));
  const activeTeamShotCount = isTeam
    ? (activeTeam === 'a' ? teamAShots.length : teamBShots.length)
    : shots.filter((s) => s.playerId === currentPlayer).length;

  // For individual with multiple players: track per-player
  const currentPlayerShots = shots.filter((s) => s.playerId === currentPlayer);
  const currentPlayerShotCount = currentPlayerShots.length;

  // Shot count to show in progress bar
  const displayShotCount = isTeam ? activeTeamShotCount : currentPlayerShotCount;
  const isActiveTeamDone = displayShotCount >= maxShots;

  // Last zone for the current player (individual: can't repeat)
  const lastZoneForPlayer = currentPlayerShots.at(-1)?.shotFrom ?? null;
  const disabledZone = !isTeam ? lastZoneForPlayer : null;

  // Player shot counts for team constraint enforcement
  const playerShotCounts: Record<string, number> = {};
  if (game) {
    for (const pid of game.playerIds) {
      playerShotCounts[pid] = shots.filter((s) => s.playerId === pid).length;
    }
  }

  // Team constraint warnings
  const getTeamWarning = useCallback((): string | null => {
    if (!isTeam || !game) return null;
    const teamPlayers = activeTeam === 'a' ? teamAPlayers : teamBPlayers;
    const teamShotCount = activeTeam === 'a' ? teamAShots.length : teamBShots.length;
    const remaining = maxShots - teamShotCount;
    const playersUnderMin = teamPlayers.filter(
      (pid) => (playerShotCounts[pid] ?? 0) < TEAM_PLAYER_MIN_SHOTS,
    );
    const shotsNeeded = playersUnderMin.reduce(
      (sum, pid) => sum + (TEAM_PLAYER_MIN_SHOTS - (playerShotCounts[pid] ?? 0)),
      0,
    );
    if (shotsNeeded > remaining) {
      return `Warning: Not enough shots left for all players to reach ${TEAM_PLAYER_MIN_SHOTS} minimum.`;
    }
    if (shotsNeeded > 0 && shotsNeeded === remaining) {
      return `All remaining shots must go to players below the ${TEAM_PLAYER_MIN_SHOTS}-shot minimum.`;
    }
    return null;
  }, [isTeam, game, activeTeam, teamAPlayers, teamBPlayers, teamAShots.length, teamBShots.length, maxShots, playerShotCounts]);

  function isPlayerSelectable(pid: string): boolean {
    if (!isTeam) return true;
    if ((playerShotCounts[pid] ?? 0) >= TEAM_PLAYER_MAX_SHOTS) return false;
    return true;
  }

  function getRequiredPlayers(): string[] {
    if (!isTeam || !game) return [];
    const teamPlayers = activeTeam === 'a' ? teamAPlayers : teamBPlayers;
    const teamShotCount = activeTeam === 'a' ? teamAShots.length : teamBShots.length;
    const remaining = maxShots - teamShotCount;
    const playersUnderMin = teamPlayers.filter(
      (pid) => (playerShotCounts[pid] ?? 0) < TEAM_PLAYER_MIN_SHOTS,
    );
    const shotsNeeded = playersUnderMin.reduce(
      (sum, pid) => sum + (TEAM_PLAYER_MIN_SHOTS - (playerShotCounts[pid] ?? 0)),
      0,
    );
    if (shotsNeeded >= remaining) {
      return playersUnderMin;
    }
    return [];
  }

  // Click zone → then click make/miss to record immediately
  async function handleResult(result: ShotResult) {
    if (!gameId || !selectedZone || !game || submitting) return;

    const shotNumber = isTeam
      ? (activeTeam === 'a' ? teamAShots.length : teamBShots.length) + 1
      : currentPlayerShotCount + 1;

    setSubmitting(true);
    try {
      await recordShot(gameId, currentPlayer, game.activityType, selectedZone, result, shotNumber);

      const pts = result === 'make' ? ZONE_POINTS[selectedZone] : 0;
      setToast({
        message: result === 'make'
          ? `+${pts} point${pts > 1 ? 's' : ''} from Zone ${selectedZone}!`
          : `Miss from Zone ${selectedZone}`,
        type: result === 'make' ? 'success' : 'info',
      });

      setSelectedZone(null);

      // Auto-complete if the whole game is done
      const newActiveCount = displayShotCount + 1;
      if (isTeam) {
        const otherTeamDone = activeTeam === 'a'
          ? teamBShots.length >= maxShots
          : teamAShots.length >= maxShots;
        if (newActiveCount >= maxShots && otherTeamDone) {
          await completeGame(gameId);
        } else if (newActiveCount >= maxShots) {
          // Switch to the other team automatically
          setToast({ message: `${activeTeam === 'a' ? 'Team A' : 'Team B'} is done! Switching teams.`, type: 'success' });
          const nextTeam = activeTeam === 'a' ? 'b' : 'a';
          setActiveTeam(nextTeam);
          const nextPlayers = nextTeam === 'a' ? teamAPlayers : teamBPlayers;
          if (nextPlayers.length > 0) setCurrentPlayer(nextPlayers[0]);
          setSelectedZone(null);
        }
      } else {
        // Individual: check if current player is done, move to next
        if (currentPlayerShotCount + 1 >= maxShots) {
          const allPlayers = game.playerIds;
          const currentIdx = allPlayers.indexOf(currentPlayer);
          const nextPlayer = allPlayers[currentIdx + 1];
          if (nextPlayer) {
            setToast({ message: `${currentPlayer} is done! Next: ${nextPlayer}`, type: 'success' });
            setCurrentPlayer(nextPlayer);
            setSelectedZone(null);
          } else {
            await completeGame(gameId);
          }
        }
      }
    } catch (err) {
      console.error(err);
      setToast({ message: 'Failed to record shot. Try again.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEndEarly() {
    if (!gameId) return;
    if (isTeam && game) {
      const allTeamPlayers = [...teamAPlayers, ...teamBPlayers];
      const underMin = allTeamPlayers.filter(
        (pid) => (playerShotCounts[pid] ?? 0) > 0 && (playerShotCounts[pid] ?? 0) < TEAM_PLAYER_MIN_SHOTS,
      );
      if (underMin.length > 0) {
        setToast({
          message: `Cannot end: ${underMin.join(', ')} ha${underMin.length > 1 ? 've' : 's'} fewer than ${TEAM_PLAYER_MIN_SHOTS} shots.`,
          type: 'warning',
        });
        setShowConfirmEnd(false);
        return;
      }
    }
    await completeGame(gameId);
    setShowConfirmEnd(false);
  }

  function handleSwitchTeam(team: TeamKey) {
    setActiveTeam(team);
    const teamPlayers = team === 'a' ? teamAPlayers : teamBPlayers;
    if (teamPlayers.length > 0 && !teamPlayers.includes(currentPlayer)) {
      setCurrentPlayer(teamPlayers[0]);
    }
    setSelectedZone(null);
  }

  const teamWarning = getTeamWarning();
  const requiredPlayers = getRequiredPlayers();

  if (!game) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-6 w-6 border-2 border-gray-300 border-t-blue-600 rounded-full" />
      </div>
    );
  }

  // Points display
  const displayPoints = isTeam
    ? (activeTeam === 'a' ? teamAShots : teamBShots).reduce((s, shot) => s + shot.pointsEarned, 0)
    : currentPlayerShots.reduce((s, shot) => s + shot.pointsEarned, 0);

  const activeTeamShotsLog = isTeam
    ? (activeTeam === 'a' ? teamAShots : teamBShots)
    : currentPlayerShots;

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar
        title={isTeam ? 'Team Game' : 'Individual Game'}
        showBack
        backTo="/home"
        trailing={
          <button
            onClick={() => setShowConfirmEnd(true)}
            className="text-sm text-red-500 hover:text-red-600 font-medium"
          >
            End
          </button>
        }
      />

      <div className="max-w-lg mx-auto p-4 space-y-3">
        {/* Team tabs */}
        {isTeam && (
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {(['a', 'b'] as const).map((team) => {
              const teamShotCount = team === 'a' ? teamAShots.length : teamBShots.length;
              const done = teamShotCount >= maxShots;
              return (
                <button
                  key={team}
                  onClick={() => handleSwitchTeam(team)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    activeTeam === team
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Team {team.toUpperCase()}
                  <span className={`ml-1.5 text-xs ${activeTeam === team ? 'text-gray-400' : 'text-gray-400'}`}>
                    {teamShotCount}/{maxShots}
                    {done ? ' ✓' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Progress */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-900">
              {isActiveTeamDone
                ? 'All shots complete'
                : `Shot ${displayShotCount + 1} of ${maxShots}`
              }
            </span>
            <span className="text-sm font-semibold text-gray-900">
              {displayPoints} pts
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-300"
              style={{ width: `${Math.min((displayShotCount / maxShots) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Team warning */}
        {teamWarning && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-xs text-amber-800">{teamWarning}</p>
          </div>
        )}

        {/* Player selector (team) */}
        {isTeam && !isActiveTeamDone && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
              Shooter
            </h3>
            <div className="flex flex-wrap gap-2">
              {activeTeamPlayers.map((pid) => {
                const shotCount = playerShotCounts[pid] ?? 0;
                const atMax = shotCount >= TEAM_PLAYER_MAX_SHOTS;
                const isRequired = requiredPlayers.includes(pid);
                const selectable = isPlayerSelectable(pid) && (requiredPlayers.length === 0 || isRequired);
                const isActive = currentPlayer === pid;

                return (
                  <button
                    key={pid}
                    onClick={() => selectable && setCurrentPlayer(pid)}
                    disabled={!selectable}
                    className={`
                      px-3 py-2 rounded-xl text-sm font-medium transition-all
                      ${isActive
                        ? 'bg-blue-600 text-white shadow-sm'
                        : selectable
                          ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          : 'bg-gray-50 text-gray-300 cursor-not-allowed'
                      }
                      ${isRequired && !isActive ? 'ring-2 ring-amber-400' : ''}
                    `}
                  >
                    {pid}
                    <span className={`ml-1.5 text-xs ${isActive ? 'text-blue-200' : 'text-gray-400'}`}>
                      {shotCount}{atMax ? ' (max)' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Current player (individual with multiple) */}
        {!isTeam && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-700 font-semibold text-xs">
                    {currentPlayer.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{currentPlayer}</p>
                  {disabledZone && (
                    <p className="text-xs text-gray-400">Zone {disabledZone} disabled (last shot)</p>
                  )}
                </div>
              </div>
              {(game?.playerIds.length ?? 0) > 1 && (
                <span className="text-xs text-gray-400">
                  Player {game!.playerIds.indexOf(currentPlayer) + 1} of {game!.playerIds.length}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Zone grid + Make/Miss */}
        {!isActiveTeamDone ? (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <ZoneGrid
                onSelectZone={setSelectedZone}
                disabledZone={disabledZone}
                selectedZone={selectedZone}
              />
            </div>

            {/* Make / Miss — acts as record button */}
            <div className="flex gap-3">
              <button
                onClick={() => handleResult('make')}
                disabled={!selectedZone || submitting}
                className={`flex-1 py-4 rounded-xl font-semibold text-lg transition-all ${
                  selectedZone && !submitting
                    ? 'bg-green-600 hover:bg-green-700 text-white shadow-sm shadow-green-600/20 active:scale-[0.98]'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                Make
              </button>
              <button
                onClick={() => handleResult('miss')}
                disabled={!selectedZone || submitting}
                className={`flex-1 py-4 rounded-xl font-semibold text-lg transition-all ${
                  selectedZone && !submitting
                    ? 'bg-red-500 hover:bg-red-600 text-white shadow-sm shadow-red-500/20 active:scale-[0.98]'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                Miss
              </button>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <p className="text-gray-500">
              {isTeam
                ? `Team ${activeTeam.toUpperCase()} is done.`
                : `${currentPlayer} is done.`
              }
            </p>
            {isTeam && (
              <p className="text-xs text-gray-400 mt-1">
                {teamAShots.length >= maxShots && teamBShots.length >= maxShots
                  ? 'Both teams finished! Completing game…'
                  : `Switch to the other team to continue.`
                }
              </p>
            )}
          </div>
        )}

        {/* Shot log */}
        {activeTeamShotsLog.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
              Shot Log {isTeam ? `· Team ${activeTeam.toUpperCase()}` : ''}
            </h3>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {[...activeTeamShotsLog].reverse().map((shot, i) => (
                <div
                  key={shot.id ?? i}
                  className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-5">#{shot.shotNumber}</span>
                    {(isTeam || (game?.playerIds.length ?? 0) > 1) && (
                      <span className="text-xs font-medium text-gray-600">{shot.playerId}</span>
                    )}
                    <span className="text-gray-500">Zone {shot.shotFrom}</span>
                  </div>
                  <span className={`font-medium text-xs px-2 py-0.5 rounded-md ${
                    shot.result === 'make'
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-500'
                  }`}>
                    {shot.result === 'make' ? `+${shot.pointsEarned}` : 'Miss'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* End game confirmation */}
      {showConfirmEnd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-medium text-gray-900">End game early?</h3>
            <p className="text-sm text-gray-500 mt-2">
              This action cannot be undone.
            </p>
            {isTeam && (
              <div className="text-xs text-gray-400 mt-2 space-y-1">
                <p>Team A: {teamAShots.length}/{maxShots} shots</p>
                <p>Team B: {teamBShots.length}/{maxShots} shots</p>
              </div>
            )}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowConfirmEnd(false)}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEndEarly}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-medium hover:bg-red-600 transition-colors"
              >
                End Game
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
          duration={2000}
        />
      )}
    </div>
  );
}
