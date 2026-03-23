import { ZONE_POINTS } from '../lib/scoring';

interface ZoneGridProps {
  onSelectZone: (zone: number) => void;
  disabledZone?: number | null;
  selectedZone?: number | null;
}

// 3x3 grid layout:
// [   ] [Z1] [   ]
// [Z2 ] [   ] [Z3 ]
// [Z4 ] [Z5 ] [Z6 ]
const GRID: (number | null)[] = [
  null, 1, null,
  2, null, 3,
  4, 5, 6,
];

const POINT_BG: Record<number, { normal: string; selected: string; disabled: string }> = {
  1: {
    normal: 'bg-green-500 hover:bg-green-600 text-white',
    selected: 'bg-green-700 ring-4 ring-green-300 text-white scale-[0.96]',
    disabled: 'bg-gray-200 text-gray-400 cursor-not-allowed',
  },
  2: {
    normal: 'bg-amber-500 hover:bg-amber-600 text-white',
    selected: 'bg-amber-700 ring-4 ring-amber-300 text-white scale-[0.96]',
    disabled: 'bg-gray-200 text-gray-400 cursor-not-allowed',
  },
  3: {
    normal: 'bg-red-500 hover:bg-red-600 text-white',
    selected: 'bg-red-700 ring-4 ring-red-300 text-white scale-[0.96]',
    disabled: 'bg-gray-200 text-gray-400 cursor-not-allowed',
  },
};

export default function ZoneGrid({ onSelectZone, disabledZone, selectedZone }: ZoneGridProps) {
  return (
    <div className="grid grid-cols-3 w-full aspect-[3/3] rounded-2xl overflow-hidden">
      {GRID.map((zone, i) => {
        if (zone === null) {
          return (
            <div key={`empty-${i}`} className="bg-gray-100 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-gray-200" />
            </div>
          );
        }

        const pts = ZONE_POINTS[zone];
        const colors = POINT_BG[pts];
        const isDisabled = zone === disabledZone;
        const isSelected = zone === selectedZone;

        return (
          <button
            key={zone}
            onClick={() => !isDisabled && onSelectZone(zone)}
            disabled={isDisabled}
            className={`
              flex flex-col items-center justify-center font-medium transition-all duration-100
              ${isDisabled ? colors.disabled : isSelected ? colors.selected : colors.normal}
              active:scale-95
            `}
          >
            <span className="text-2xl font-bold">Z{zone}</span>
            <span className="text-sm opacity-80">
              {pts} pt{pts > 1 ? 's' : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}
