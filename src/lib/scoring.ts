export const ZONE_POINTS: Record<number, number> = {
  1: 1,
  2: 2,
  3: 2,
  4: 3,
  5: 3,
  6: 3,
};

export const ZONES = [1, 2, 3, 4, 5, 6] as const;

export const INDIVIDUAL_MAX_SHOTS = 20;
export const TEAM_MAX_SHOTS = 30;
export const TEAM_PLAYER_MIN_SHOTS = 5;
export const TEAM_PLAYER_MAX_SHOTS = 15;

export function getPointsForZone(zone: number): number {
  return ZONE_POINTS[zone] ?? 0;
}

export function getZoneLabel(zone: number): string {
  const pts = ZONE_POINTS[zone];
  return `${pts} pt${pts > 1 ? 's' : ''}`;
}

export function getZoneColor(zone: number): string {
  switch (ZONE_POINTS[zone]) {
    case 1: return '#34a853';
    case 2: return '#fbbc04';
    case 3: return '#ea4335';
    default: return '#9aa0a6';
  }
}

export function getMaxShots(activityType: 'individual' | 'team'): number {
  return activityType === 'individual' ? INDIVIDUAL_MAX_SHOTS : TEAM_MAX_SHOTS;
}

export function getAccuracyColor(accuracy: number): string {
  if (accuracy >= 0.7) return '#34a853';
  if (accuracy >= 0.4) return '#fbbc04';
  return '#ea4335';
}

export function getHeatmapColor(accuracy: number): string {
  if (accuracy === 0) return '#f1f3f4';
  if (accuracy < 0.25) return '#fce8e6';
  if (accuracy < 0.5) return '#feefc3';
  if (accuracy < 0.75) return '#e6f4ea';
  return '#ceead6';
}
