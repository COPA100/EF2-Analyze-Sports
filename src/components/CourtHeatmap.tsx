import type { ZonePerformance } from '../types';
import { ZONE_POINTS, getHeatmapColor } from '../lib/scoring';

interface CourtHeatmapProps {
  zonePerformance: Record<string, ZonePerformance>;
}

interface ZoneDef {
  zone: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

const ZONE_DEFS: ZoneDef[] = [
  { zone: 4, x: 10, y: 10, width: 90, height: 80 },
  { zone: 5, x: 105, y: 10, width: 90, height: 80 },
  { zone: 6, x: 200, y: 10, width: 90, height: 80 },
  { zone: 2, x: 60, y: 95, width: 90, height: 70 },
  { zone: 3, x: 155, y: 95, width: 90, height: 70 },
  { zone: 1, x: 110, y: 170, width: 80, height: 65 },
];

export default function CourtHeatmap({ zonePerformance }: CourtHeatmapProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <h3 className="text-sm font-medium text-gray-900 mb-3">Shot Chart</h3>
      <svg viewBox="0 0 300 260" className="w-full max-w-sm mx-auto">
        {/* Court background */}
        <rect x="5" y="5" width="290" height="250" rx="16" fill="#f8f9fa" stroke="#e8eaed" strokeWidth="1" />

        {/* Zones */}
        {ZONE_DEFS.map(({ zone, x, y, width, height }) => {
          const perf = zonePerformance[String(zone)] ?? { makes: 0, attempts: 0 };
          const accuracy = perf.attempts > 0 ? perf.makes / perf.attempts : 0;
          const pts = ZONE_POINTS[zone];

          return (
            <g key={zone}>
              <rect
                x={x}
                y={y}
                width={width}
                height={height}
                rx="12"
                fill={getHeatmapColor(accuracy)}
                stroke="#dadce0"
                strokeWidth="1"
              />
              <text
                x={x + width / 2}
                y={y + height / 2 - 14}
                textAnchor="middle"
                fontSize="13"
                fontWeight="600"
                fill="#202124"
              >
                Zone {zone}
              </text>
              <text
                x={x + width / 2}
                y={y + height / 2 + 4}
                textAnchor="middle"
                fontSize="11"
                fill="#5f6368"
              >
                {perf.attempts > 0 ? `${Math.round(accuracy * 100)}%` : '—'}
              </text>
              <text
                x={x + width / 2}
                y={y + height / 2 + 20}
                textAnchor="middle"
                fontSize="10"
                fill="#9aa0a6"
              >
                {perf.makes}/{perf.attempts} · {pts}pt{pts > 1 ? 's' : ''}
              </text>
            </g>
          );
        })}

        {/* Basket */}
        <circle cx="150" cy="248" r="8" fill="#ea4335" opacity="0.3" />
        <circle cx="150" cy="248" r="4" fill="#ea4335" />
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-3">
        <LegendItem color="#f1f3f4" label="No shots" />
        <LegendItem color="#fce8e6" label="<25%" />
        <LegendItem color="#feefc3" label="25-50%" />
        <LegendItem color="#e6f4ea" label="50-75%" />
        <LegendItem color="#ceead6" label=">75%" />
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className="w-3 h-3 rounded" style={{ backgroundColor: color, border: '1px solid #dadce0' }} />
      <span className="text-[10px] text-gray-500">{label}</span>
    </div>
  );
}
