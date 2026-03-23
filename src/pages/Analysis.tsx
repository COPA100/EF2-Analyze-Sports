import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getGameSession, getShotsForGame } from '../lib/firebase';
import { ZONE_POINTS, ZONES, getZoneColor, getAccuracyColor } from '../lib/scoring';
import type { GameSession, Shot, TeamKey } from '../types';
import TopBar from '../components/TopBar';
import CourtHeatmap from '../components/CourtHeatmap';
import StatsBar from '../components/StatsBar';
import StatCard from '../components/StatCard';

export default function Analysis() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<GameSession | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'zones' | 'teams'>('overview');
  const [heatmapTeam, setHeatmapTeam] = useState<'all' | TeamKey>('all');

  useEffect(() => {
    if (!gameId) return;
    Promise.all([getGameSession(gameId), getShotsForGame(gameId)])
      .then(([g, s]) => {
        setGame(g);
        setShots(s);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [gameId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-6 w-6 border-2 border-gray-300 border-t-blue-600 rounded-full" />
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <p className="text-gray-500 mb-4">Game not found</p>
        <button onClick={() => navigate('/home')} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-medium">
          Go Home
        </button>
      </div>
    );
  }

  const isTeam = game.activityType === 'team';
  const teamAPlayers = game.teams?.a ?? [];
  const teamBPlayers = game.teams?.b ?? [];

  // Filter shots by heatmap team selection
  function filterShots(team: 'all' | TeamKey): Shot[] {
    if (team === 'all' || !isTeam) return shots;
    const players = team === 'a' ? teamAPlayers : teamBPlayers;
    return shots.filter((s) => players.includes(s.playerId));
  }

  function computeZonePerf(filteredShots: Shot[]) {
    const perf: Record<string, { makes: number; attempts: number }> = {};
    for (const z of ZONES) perf[String(z)] = { makes: 0, attempts: 0 };
    for (const s of filteredShots) {
      const key = String(s.shotFrom);
      perf[key].attempts++;
      if (s.result === 'make') perf[key].makes++;
    }
    return perf;
  }

  function computePlayerPerf(filteredShots: Shot[]) {
    const perf: Record<string, { points: number; shots: number; makes: number; accuracy: number }> = {};
    for (const s of filteredShots) {
      if (!perf[s.playerId]) perf[s.playerId] = { points: 0, shots: 0, makes: 0, accuracy: 0 };
      perf[s.playerId].shots++;
      perf[s.playerId].points += s.pointsEarned;
      if (s.result === 'make') perf[s.playerId].makes++;
    }
    for (const pid of Object.keys(perf)) {
      perf[pid].accuracy = perf[pid].shots > 0 ? perf[pid].makes / perf[pid].shots : 0;
    }
    return perf;
  }

  const displayShots = filterShots(heatmapTeam);
  const zonePerf = computeZonePerf(displayShots);
  const totalMakes = displayShots.filter((s) => s.result === 'make').length;
  const overallAccuracy = displayShots.length > 0 ? totalMakes / displayShots.length : 0;
  const totalPoints = displayShots.reduce((s, shot) => s + shot.pointsEarned, 0);

  // Best zone by expected value
  const zoneEV = ZONES.map((z) => {
    const perf = zonePerf[String(z)];
    const acc = perf.attempts > 0 ? perf.makes / perf.attempts : 0;
    return { zone: z, ev: acc * ZONE_POINTS[z], accuracy: acc, attempts: perf.attempts };
  });
  const bestZone = zoneEV.filter((z) => z.attempts > 0).sort((a, b) => b.ev - a.ev)[0];

  const pointsPerZone = ZONES.map((z) => {
    const perf = zonePerf[String(z)];
    return {
      label: `Zone ${z} (${ZONE_POINTS[z]}pt${ZONE_POINTS[z] > 1 ? 's' : ''})`,
      value: perf.makes * ZONE_POINTS[z],
      maxValue: Math.max(...ZONES.map((zz) => {
        const p = zonePerf[String(zz)];
        return p.makes * ZONE_POINTS[zz];
      }), 1),
      color: getZoneColor(z),
    };
  });

  const expectedVsActual = ZONES.map((z) => {
    const perf = zonePerf[String(z)];
    const acc = perf.attempts > 0 ? perf.makes / perf.attempts : 0;
    return {
      zone: z,
      accuracy: acc,
      expectedPerShot: acc * ZONE_POINTS[z],
      actualPoints: perf.makes * ZONE_POINTS[z],
      potentialPoints: perf.attempts * ZONE_POINTS[z],
      attempts: perf.attempts,
    };
  });

  // Team comparison stats
  const teamAStats = {
    shots: filterShots('a'),
    points: filterShots('a').reduce((s, shot) => s + shot.pointsEarned, 0),
    makes: filterShots('a').filter((s) => s.result === 'make').length,
  };
  const teamBStats = {
    shots: filterShots('b'),
    points: filterShots('b').reduce((s, shot) => s + shot.pointsEarned, 0),
    makes: filterShots('b').filter((s) => s.result === 'make').length,
  };

  const teamAPlayerPerf = computePlayerPerf(teamAStats.shots);
  const teamBPlayerPerf = computePlayerPerf(teamBStats.shots);

  const tabs = isTeam
    ? ['overview', 'zones', 'teams'] as const
    : ['overview', 'zones'] as const;

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar title="Game Analysis" showBack backTo="/home" />

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-medium ${
              isTeam ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'
            }`}>
              {game.activityType} · Table {game.tableId}
            </span>
            {isTeam && (
              <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                {(['all', 'a', 'b'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setHeatmapTeam(t)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      heatmapTeam === t
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t === 'all' ? 'All' : `Team ${t.toUpperCase()}`}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-3xl font-bold text-gray-900">{totalPoints}</p>
              <p className="text-xs text-gray-500 mt-1">Points</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900">{displayShots.length}</p>
              <p className="text-xs text-gray-500 mt-1">Shots</p>
            </div>
            <div>
              <p className="text-3xl font-bold" style={{ color: getAccuracyColor(overallAccuracy) }}>
                {displayShots.length > 0 ? `${Math.round(overallAccuracy * 100)}%` : '—'}
              </p>
              <p className="text-xs text-gray-500 mt-1">Accuracy</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Best Zone"
                value={bestZone ? `Zone ${bestZone.zone}` : '—'}
                sublabel={bestZone ? `${bestZone.ev.toFixed(1)} exp pts/shot` : undefined}
                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
              />
              <StatCard
                label="Points/Shot"
                value={displayShots.length > 0 ? (totalPoints / displayShots.length).toFixed(1) : '—'}
                sublabel="Average"
                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></svg>}
              />
            </div>

            <CourtHeatmap zonePerformance={zonePerf} />

            {/* Expected vs Actual */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-4">Expected vs Actual Points</h3>
              <div className="space-y-3">
                {expectedVsActual.filter((z) => z.attempts > 0).map((z) => {
                  const maxPotential = Math.max(...expectedVsActual.map((e) => e.potentialPoints), 1);
                  return (
                    <div key={z.zone} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600">Zone {z.zone}</span>
                        <span className="text-gray-400">{z.actualPoints} of {z.potentialPoints} possible</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden relative">
                        <div className="absolute h-full rounded-full bg-gray-200" style={{ width: `${(z.potentialPoints / maxPotential) * 100}%` }} />
                        <div className="relative h-full rounded-full transition-all duration-500" style={{ width: `${(z.actualPoints / maxPotential) * 100}%`, backgroundColor: getZoneColor(z.zone) }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-400">
                        <span>{Math.round(z.accuracy * 100)}% accuracy</span>
                        <span>{z.expectedPerShot.toFixed(1)} exp pts/shot</span>
                      </div>
                    </div>
                  );
                })}
                {expectedVsActual.every((z) => z.attempts === 0) && (
                  <p className="text-sm text-gray-400 text-center py-4">No shots recorded</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Zones */}
        {activeTab === 'zones' && (
          <div className="space-y-4">
            <StatsBar title="Points by Zone" items={pointsPerZone} />

            <div className="grid grid-cols-2 gap-3">
              {ZONES.map((z) => {
                const perf = zonePerf[String(z)];
                const acc = perf.attempts > 0 ? perf.makes / perf.attempts : 0;
                return (
                  <div key={z} className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900">Zone {z}</span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-md" style={{ backgroundColor: getZoneColor(z) + '20', color: getZoneColor(z) }}>
                        {ZONE_POINTS[z]}pt{ZONE_POINTS[z] > 1 ? 's' : ''}
                      </span>
                    </div>
                    <p className="text-xl font-semibold" style={{ color: perf.attempts > 0 ? getAccuracyColor(acc) : '#9aa0a6' }}>
                      {perf.attempts > 0 ? `${Math.round(acc * 100)}%` : '—'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{perf.makes}/{perf.attempts} made</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Teams */}
        {activeTab === 'teams' && isTeam && (
          <div className="space-y-4">
            {/* Head-to-head comparison */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-4">Head to Head</h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="text-right">
                  <p className="text-2xl font-bold text-blue-600">{teamAStats.points}</p>
                  <p className="text-xs text-gray-400">Team A</p>
                </div>
                <div className="flex items-center justify-center">
                  <span className="text-xs font-medium text-gray-400 uppercase">Points</span>
                </div>
                <div className="text-left">
                  <p className="text-2xl font-bold text-red-500">{teamBStats.points}</p>
                  <p className="text-xs text-gray-400">Team B</p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <ComparisonRow
                  label="Accuracy"
                  valueA={teamAStats.shots.length > 0 ? `${Math.round((teamAStats.makes / teamAStats.shots.length) * 100)}%` : '—'}
                  valueB={teamBStats.shots.length > 0 ? `${Math.round((teamBStats.makes / teamBStats.shots.length) * 100)}%` : '—'}
                  rawA={teamAStats.shots.length > 0 ? teamAStats.makes / teamAStats.shots.length : 0}
                  rawB={teamBStats.shots.length > 0 ? teamBStats.makes / teamBStats.shots.length : 0}
                />
                <ComparisonRow
                  label="Pts/Shot"
                  valueA={teamAStats.shots.length > 0 ? (teamAStats.points / teamAStats.shots.length).toFixed(1) : '—'}
                  valueB={teamBStats.shots.length > 0 ? (teamBStats.points / teamBStats.shots.length).toFixed(1) : '—'}
                  rawA={teamAStats.shots.length > 0 ? teamAStats.points / teamAStats.shots.length : 0}
                  rawB={teamBStats.shots.length > 0 ? teamBStats.points / teamBStats.shots.length : 0}
                />
                <ComparisonRow
                  label="Makes"
                  valueA={String(teamAStats.makes)}
                  valueB={String(teamBStats.makes)}
                  rawA={teamAStats.makes}
                  rawB={teamBStats.makes}
                />
              </div>
            </div>

            {/* Team A leaderboard */}
            <PlayerLeaderboard
              title="Team A Players"
              color="blue"
              players={teamAPlayers}
              perf={teamAPlayerPerf}
            />

            {/* Team B leaderboard */}
            <PlayerLeaderboard
              title="Team B Players"
              color="red"
              players={teamBPlayers}
              perf={teamBPlayerPerf}
            />
          </div>
        )}

        {/* Individual leaderboard (if multiple players) */}
        {activeTab === 'teams' && !isTeam && game.playerIds.length > 1 && (
          <PlayerLeaderboard
            title="Player Leaderboard"
            color="blue"
            players={game.playerIds}
            perf={computePlayerPerf(shots)}
          />
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2 pb-6">
          <button
            onClick={() => navigate('/home')}
            className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors"
          >
            Home
          </button>
          <button
            onClick={() => navigate(`/setup/${game.activityType}`)}
            className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            Play Again
          </button>
        </div>
      </div>
    </div>
  );
}

function ComparisonRow({
  label,
  valueA,
  valueB,
  rawA,
  rawB,
}: {
  label: string;
  valueA: string;
  valueB: string;
  rawA: number;
  rawB: number;
}) {
  const total = rawA + rawB || 1;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-medium text-blue-600">{valueA}</span>
        <span className="text-gray-400">{label}</span>
        <span className="font-medium text-red-500">{valueB}</span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100">
        <div className="bg-blue-500 transition-all duration-500" style={{ width: `${(rawA / total) * 100}%` }} />
        <div className="bg-red-400 transition-all duration-500 ml-auto" style={{ width: `${(rawB / total) * 100}%` }} />
      </div>
    </div>
  );
}

function PlayerLeaderboard({
  title,
  color,
  players,
  perf,
}: {
  title: string;
  color: 'blue' | 'red';
  players: string[];
  perf: Record<string, { points: number; shots: number; makes: number; accuracy: number }>;
}) {
  const sorted = players
    .map((pid) => ({ pid, ...(perf[pid] ?? { points: 0, shots: 0, makes: 0, accuracy: 0 }) }))
    .sort((a, b) => b.points - a.points);

  const accentBg = color === 'blue' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700';
  const medal = ['bg-amber-100 text-amber-700', 'bg-gray-200 text-gray-600', 'bg-orange-100 text-orange-700'];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <h3 className="text-sm font-medium text-gray-900 mb-3">{title}</h3>
      <div className="space-y-2">
        {sorted.map((p, i) => (
          <div key={p.pid} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${medal[i] ?? accentBg}`}>
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{p.pid}</p>
              <p className="text-xs text-gray-500">{p.shots} shots · {Math.round(p.accuracy * 100)}%</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-gray-900">{p.points}</p>
              <p className="text-[10px] text-gray-400">pts</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
