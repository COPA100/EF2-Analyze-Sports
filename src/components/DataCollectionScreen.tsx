import { useState } from 'react';
import { Target, CheckCircle, XCircle } from 'lucide-react';
import BasketballCourtHeatMap from './BasketballCourtHeatMap';
import type { HeatmapShot } from './BasketballCourtHeatMap';
import type { Shot as AppShot, GameSession } from '../types';

const ZONE_LABELS: Record<string, string> = {
  '1': 'Paint',
  '2': 'Left Wing',
  '3': 'Right Wing',
  '4': 'Left Corner',
  '5': 'Top of Key',
  '6': 'Right Corner',
};

type DataCollectionScreenProps = {
  session: GameSession;
  shots: AppShot[];
  currentPlayerId: string;
  currentTeam: 'team1' | 'team2' | null;
  disabledZone: number | null;
  saving: boolean;
  error: string;
  onRecordShot: (zone: number, result: 'make' | 'miss') => void;
  onUndo: () => void;
};

export default function DataCollectionScreen({
  session,
  shots,
  currentPlayerId,
  currentTeam,
  disabledZone,
  saving,
  error,
  onRecordShot,
  onUndo,
}: DataCollectionScreenProps) {
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const isTeam = session.activityType === 'team';

  // Convert app shots to heatmap format, filtered to current team's shots
  const heatmapShots: HeatmapShot[] = (() => {
    let filtered: AppShot[];
    if (isTeam && session.teams && currentTeam) {
      const teamPlayers = session.teams[currentTeam];
      filtered = shots.filter((s) => teamPlayers.includes(s.playerId));
    } else {
      filtered = shots;
    }
    return filtered.map((s) => ({
      location: String(s.shotFrom),
      made: s.result === 'make',
    }));
  })();

  const handleMakeOrMiss = (made: boolean) => {
    if (!selectedZone) return;
    onRecordShot(Number(selectedZone), made ? 'make' : 'miss');
    setShowConfirmation(true);
    setTimeout(() => {
      setShowConfirmation(false);
      setSelectedZone(null);
    }, 800);
  };

  const handleZoneClick = (zone: string) => {
    if (disabledZone !== null && zone === String(disabledZone)) return;
    setSelectedZone(zone);
  };

  // Shot counters
  let shotDisplay: string;
  if (isTeam && session.teams) {
    const t1 = shots.filter((s) => session.teams!.team1.includes(s.playerId)).length;
    const t2 = shots.filter((s) => session.teams!.team2.includes(s.playerId)).length;
    shotDisplay = `Team 1: ${t1}/30  |  Team 2: ${t2}/30`;
  } else {
    shotDisplay = `Shot ${shots.length + 1} of 20`;
  }

  // Build player list for sidebar
  const team1Players = isTeam && session.teams
    ? session.teams.team1
    : session.playerIds;
  const team2Players = isTeam && session.teams
    ? session.teams.team2
    : [];

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {/* Header Bar */}
      <div className="bg-gray-900 border-b-4 border-gray-700 shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center">
              <Target className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">
                Live Data Collection
              </h1>
              <p className="text-sm text-gray-400">
                {shotDisplay}
              </p>
            </div>
          </div>
          <button
            onClick={onUndo}
            disabled={shots.length === 0 || saving}
            className="text-gray-400 hover:text-white disabled:text-gray-700 text-sm underline transition-colors"
          >
            Undo last shot
          </button>
        </div>
      </div>

      {/* Error toast */}
      {error && (
        <div className="bg-red-900/80 text-red-200 text-center py-2 text-sm">
          {error}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-3">
        <div className="h-full flex gap-3">
          {/* Left Sidebar: Player Selection & Record Result */}
          <div className="w-[240px] flex-shrink-0 flex flex-col gap-3">
            {/* Step 1: Select Player (read-only — shows whose turn it is) */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold text-lg">
                  1
                </div>
                <h2 className="text-xl font-bold text-white">
                  Current Shooter
                </h2>
              </div>
              <div className="flex flex-col gap-3">
                {/* Team 1 / Individual */}
                <div className="bg-gray-900 rounded-xl p-2 border-2 border-blue-500/50 shadow-lg">
                  <h3 className="text-lg font-bold text-blue-400 mb-2 flex items-center gap-2">
                    <div className="w-5 h-5 bg-blue-500 rounded-full"></div>
                    {isTeam ? 'Team 1' : 'Player'}
                  </h3>
                  <div className="grid grid-cols-1 gap-2">
                    {team1Players.map((pid) => (
                      <div
                        key={pid}
                        className={`py-2 rounded-lg border-2 text-base font-bold text-center transition-all ${
                          currentPlayerId === pid
                            ? 'bg-blue-500 text-white border-blue-600 shadow-lg scale-105'
                            : 'bg-gray-800 text-gray-400 border-gray-700'
                        }`}
                      >
                        {pid}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Team 2 */}
                {isTeam && team2Players.length > 0 && (
                  <div className="bg-gray-900 rounded-xl p-2 border-2 border-green-500/50 shadow-lg">
                    <h3 className="text-lg font-bold text-green-400 mb-2 flex items-center gap-2">
                      <div className="w-5 h-5 bg-green-500 rounded-full"></div>
                      Team 2
                    </h3>
                    <div className="grid grid-cols-1 gap-2">
                      {team2Players.map((pid) => (
                        <div
                          key={pid}
                          className={`py-2 rounded-lg border-2 text-base font-bold text-center transition-all ${
                            currentPlayerId === pid
                              ? 'bg-green-500 text-white border-green-600 shadow-lg scale-105'
                              : 'bg-gray-800 text-gray-400 border-gray-700'
                          }`}
                        >
                          {pid}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Step 3: Record Result */}
            <div className="flex-1 flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center font-bold text-lg">
                  3
                </div>
                <h2 className="text-xl font-bold text-white">
                  Record Result
                </h2>
              </div>
              {selectedZone && (
                <div className="mb-3 bg-orange-900/60 border-2 border-orange-500 rounded-xl p-3 text-center">
                  <span className="font-bold text-orange-300">
                    Zone {selectedZone}: {ZONE_LABELS[selectedZone]}
                  </span>
                </div>
              )}
              <div className="flex-1 flex flex-col gap-3">
                <button
                  onClick={() => handleMakeOrMiss(true)}
                  disabled={!selectedZone || saving}
                  className="flex-1 bg-gradient-to-br from-green-500 to-emerald-600 text-white rounded-2xl border-4 border-green-600 shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 flex flex-col items-center justify-center"
                >
                  <CheckCircle className="w-12 h-12 mb-2" />
                  <div className="text-2xl font-bold">{saving ? '...' : 'MADE'}</div>
                </button>
                <button
                  onClick={() => handleMakeOrMiss(false)}
                  disabled={!selectedZone || saving}
                  className="flex-1 bg-gradient-to-br from-red-500 to-rose-600 text-white rounded-2xl border-4 border-red-600 shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 flex flex-col items-center justify-center"
                >
                  <XCircle className="w-12 h-12 mb-2" />
                  <div className="text-2xl font-bold">{saving ? '...' : 'MISSED'}</div>
                </button>
              </div>
            </div>
          </div>

          {/* Main Area: Heatmap Court */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold text-lg">
                2
              </div>
              <h2 className="text-xl font-bold text-white">
                Click a Zone on the Court
              </h2>
            </div>
            <div className="flex-1 min-h-0">
              <BasketballCourtHeatMap
                shots={heatmapShots}
                onZoneClick={handleZoneClick}
                selectedZone={selectedZone}
                title={currentTeam ? `${currentTeam === 'team1' ? 'Team 1' : 'Team 2'} Heatmap` : 'Shot Heatmap'}
                compact
                showZoneStats={false}
                showQuickInsight={false}
                courtMaxWidthClass="max-w-3xl"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Toast */}
      {showConfirmation && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 bg-green-500 text-white px-8 py-4 rounded-2xl shadow-2xl border-4 border-green-600 text-2xl font-bold animate-bounce z-50">
          Shot Recorded!
        </div>
      )}
    </div>
  );
}
