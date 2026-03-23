import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { createGameSession, createUser } from '../lib/firebase';
import TopBar from '../components/TopBar';
import Toast from '../components/Toast';
import type { ActivityType } from '../types';
import { TEAM_PLAYER_MIN_SHOTS, TEAM_MAX_SHOTS } from '../lib/scoring';

export default function GameSetup() {
  const { type } = useParams<{ type: string }>();
  const activityType = (type === 'team' ? 'team' : 'individual') as ActivityType;
  const isTeam = activityType === 'team';

  const { playerId } = useUser();
  const navigate = useNavigate();

  const [tableId, setTableId] = useState('');

  // Individual: multiple players who each take 20 shots
  const [individualPlayers, setIndividualPlayers] = useState<string[]>(playerId ? [playerId] : []);
  const [newIndividualPlayer, setNewIndividualPlayer] = useState('');

  // Team: two teams
  const [teamA, setTeamA] = useState<string[]>([]);
  const [teamB, setTeamB] = useState<string[]>([]);
  const [newPlayerA, setNewPlayerA] = useState('');
  const [newPlayerB, setNewPlayerB] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Individual player management ---
  function addIndividualPlayer() {
    const trimmed = newIndividualPlayer.trim();
    if (!trimmed) return;
    if (individualPlayers.includes(trimmed)) {
      setError('Player already added');
      return;
    }
    setIndividualPlayers([...individualPlayers, trimmed]);
    setNewIndividualPlayer('');
  }

  // --- Team player management ---
  function addPlayerToTeam(team: 'a' | 'b') {
    const value = team === 'a' ? newPlayerA : newPlayerB;
    const trimmed = value.trim();
    if (!trimmed) return;

    const allPlayers = [...teamA, ...teamB];
    if (allPlayers.includes(trimmed)) {
      setError('Player already on a team');
      return;
    }

    if (team === 'a') {
      setTeamA([...teamA, trimmed]);
      setNewPlayerA('');
    } else {
      setTeamB([...teamB, trimmed]);
      setNewPlayerB('');
    }
  }

  function removePlayer(team: 'a' | 'b', id: string) {
    if (team === 'a') setTeamA(teamA.filter((p) => p !== id));
    else setTeamB(teamB.filter((p) => p !== id));
  }

  function removeIndividualPlayer(id: string) {
    setIndividualPlayers(individualPlayers.filter((p) => p !== id));
  }

  function validate(): string | null {
    if (!tableId.trim()) return 'Enter a table number';
    if (isTeam) {
      if (teamA.length < 1) return 'Team A needs at least 1 player';
      if (teamB.length < 1) return 'Team B needs at least 1 player';
      for (const team of [teamA, teamB]) {
        const minRequired = team.length * TEAM_PLAYER_MIN_SHOTS;
        if (minRequired > TEAM_MAX_SHOTS) {
          return `Too many players on a team. Max ${Math.floor(TEAM_MAX_SHOTS / TEAM_PLAYER_MIN_SHOTS)} per team`;
        }
      }
    } else {
      if (individualPlayers.length < 1) return 'Add at least one player';
    }
    return null;
  }

  async function handleStart() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isTeam) {
        const allPlayerIds = [...teamA, ...teamB];
        await Promise.all(allPlayerIds.map((pid) => createUser(pid)));
        const gameId = await createGameSession(
          'team',
          tableId.trim(),
          allPlayerIds,
          { a: teamA, b: teamB },
        );
        navigate(`/play/${gameId}`);
      } else {
        await Promise.all(individualPlayers.map((pid) => createUser(pid)));
        const gameId = await createGameSession('individual', tableId.trim(), individualPlayers);
        navigate(`/play/${gameId}`);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to create game. Check your connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar title={isTeam ? 'Team Setup' : 'Individual Setup'} showBack backTo="/home" />

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Game info */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isTeam ? 'bg-blue-50' : 'bg-green-50'
            }`}>
              <span className="text-lg">{isTeam ? '👥' : '👤'}</span>
            </div>
            <div>
              <h2 className="font-medium text-gray-900">
                {isTeam ? 'Team Play' : 'Individual Play'}
              </h2>
              <p className="text-xs text-gray-500">
                {isTeam
                  ? '2 teams · 30 shots each · Min 5, Max 15 per player'
                  : '20 shots per player · Can\'t repeat zones'}
              </p>
            </div>
          </div>
        </div>

        {/* Table ID */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <label htmlFor="tableId" className="block text-sm font-medium text-gray-700 mb-2">
            Table Number
          </label>
          <input
            id="tableId"
            type="text"
            value={tableId}
            onChange={(e) => setTableId(e.target.value)}
            placeholder="e.g., 1, 2, 3…"
            className="w-full px-4 py-3 rounded-xl border border-gray-300 text-gray-900
                       placeholder:text-gray-400 focus:outline-none focus:ring-2
                       focus:ring-blue-500 focus:border-transparent text-base"
          />
        </div>

        {/* Individual: player list */}
        {!isTeam && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-700">
              Players ({individualPlayers.length})
            </h3>
            {individualPlayers.map((p) => (
              <PlayerChip key={p} name={p} onRemove={() => removeIndividualPlayer(p)} />
            ))}
            <div className="flex gap-2">
              <input
                type="text"
                value={newIndividualPlayer}
                onChange={(e) => setNewIndividualPlayer(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addIndividualPlayer())}
                placeholder="Enter Player ID"
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 text-sm
                           text-gray-900 placeholder:text-gray-400 focus:outline-none
                           focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={addIndividualPlayer}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700
                           rounded-xl text-sm font-medium transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {/* Team: two team panels */}
        {isTeam && (
          <>
            <TeamPanel
              label="Team A"
              color="blue"
              players={teamA}
              inputValue={newPlayerA}
              onInputChange={setNewPlayerA}
              onAdd={() => addPlayerToTeam('a')}
              onRemove={(id) => removePlayer('a', id)}
            />
            <TeamPanel
              label="Team B"
              color="red"
              players={teamB}
              inputValue={newPlayerB}
              onInputChange={setNewPlayerB}
              onAdd={() => addPlayerToTeam('b')}
              onRemove={(id) => removePlayer('b', id)}
            />
          </>
        )}

        {/* Start button */}
        <button
          onClick={handleStart}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400
                     text-white font-medium py-3.5 rounded-xl transition-colors
                     shadow-sm shadow-blue-600/20 text-base"
        >
          {loading ? 'Creating game…' : 'Start Game'}
        </button>
      </div>

      {error && <Toast message={error} type="error" onClose={() => setError(null)} />}
    </div>
  );
}

function PlayerChip({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
        <span className="text-gray-600 font-semibold text-xs">
          {name.slice(0, 2).toUpperCase()}
        </span>
      </div>
      <span className="text-sm font-medium text-gray-900 flex-1">{name}</span>
      <button
        onClick={onRemove}
        className="p-1 hover:bg-gray-200 rounded-full transition-colors"
        aria-label={`Remove ${name}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function TeamPanel({
  label,
  color,
  players,
  inputValue,
  onInputChange,
  onAdd,
  onRemove,
}: {
  label: string;
  color: 'blue' | 'red';
  players: string[];
  inputValue: string;
  onInputChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const accent = color === 'blue'
    ? { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700', ring: 'focus:ring-blue-500' }
    : { bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-100 text-red-700', ring: 'focus:ring-red-500' };

  return (
    <div className={`rounded-2xl shadow-sm border ${accent.border} p-4 space-y-3 ${accent.bg}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${accent.badge}`}>
          {players.length} player{players.length !== 1 ? 's' : ''}
        </span>
      </div>

      {players.map((p) => (
        <div key={p} className="flex items-center gap-3 p-2.5 bg-white/70 rounded-xl">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center ${accent.badge}`}>
            <span className="font-semibold text-xs">{p.slice(0, 2).toUpperCase()}</span>
          </div>
          <span className="text-sm font-medium text-gray-900 flex-1">{p}</span>
          <button
            onClick={() => onRemove(p)}
            className="p-1 hover:bg-white rounded-full transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}

      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onAdd())}
          placeholder="Enter Player ID"
          className={`flex-1 px-3 py-2 rounded-xl border border-gray-300 text-sm bg-white
                     text-gray-900 placeholder:text-gray-400 focus:outline-none
                     focus:ring-2 ${accent.ring} focus:border-transparent`}
        />
        <button
          onClick={onAdd}
          className="px-3 py-2 bg-white hover:bg-gray-50 text-gray-700
                     rounded-xl text-sm font-medium transition-colors border border-gray-300"
        >
          Add
        </button>
      </div>
    </div>
  );
}
