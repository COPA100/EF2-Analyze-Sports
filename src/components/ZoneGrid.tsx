import { ZONE_POINTS } from "../lib/scoring";

interface ZoneData {
  makes: number;
  misses: number;
}

interface PlayProps {
  mode: "play";
  onZoneClick: (zone: number) => void;
  selectedZone: number | null;
  disabledZone: number | null;
  zoneData?: never;
}

interface HeatmapProps {
  mode: "heatmap";
  zoneData: Record<number, ZoneData>;
  onZoneClick?: never;
  selectedZone?: never;
  disabledZone?: never;
}

type Props = PlayProps | HeatmapProps;

/**
 * Returns a continuous heatmap color as an inline style.
 * 0% accuracy → hsl(0, 80%, 40%)  (deep red)
 * 50%         → hsl(40, 90%, 50%) (orange-yellow)
 * 100%        → hsl(140, 70%, 40%) (rich green)
 * No shots    → null (falls back to Tailwind bg-gray-800)
 */
function getHeatmapStyle(data: ZoneData | undefined): React.CSSProperties | null {
  if (!data || data.makes + data.misses === 0) return null;
  const accuracy = data.makes / (data.makes + data.misses);
  // Hue: 0 (red) → 40 (yellow) → 140 (green), using two-segment lerp
  let hue: number;
  let sat: number;
  let light: number;
  if (accuracy <= 0.5) {
    const t = accuracy / 0.5;
    hue = t * 40;          // 0 → 40
    sat = 80 + t * 10;     // 80% → 90%
    light = 40 + t * 10;   // 40% → 50%
  } else {
    const t = (accuracy - 0.5) / 0.5;
    hue = 40 + t * 100;    // 40 → 140
    sat = 90 - t * 20;     // 90% → 70%
    light = 50 - t * 10;   // 50% → 40%
  }
  return { backgroundColor: `hsl(${hue}, ${sat}%, ${light}%)` };
}

function getHeatmapLabel(data: ZoneData | undefined): string {
  if (!data || data.makes + data.misses === 0) return "0/0";
  const total = data.makes + data.misses;
  const acc = Math.round((data.makes / total) * 100);
  return `${data.makes}/${total} (${acc}%)`;
}

export default function ZoneGrid(props: Props) {
  function zoneStyle(zone: number): React.CSSProperties | undefined {
    if (props.mode === "heatmap") {
      return getHeatmapStyle(props.zoneData[zone]) ?? undefined;
    }
    return undefined;
  }

  function zoneClasses(zone: number): string {
    const base = "rounded-xl flex flex-col items-center justify-center text-white font-bold transition-all border-2 ";

    if (props.mode === "heatmap") {
      const hasShots = getHeatmapStyle(props.zoneData[zone]) !== null;
      return base + (hasShots ? "" : "bg-gray-800 ") + "border-gray-700 cursor-default";
    }

    const isSelected = props.selectedZone === zone;
    const isDisabled = props.disabledZone === zone;

    if (isDisabled) return base + "bg-gray-800 border-gray-700 opacity-40 cursor-not-allowed";
    if (isSelected) return base + "bg-yellow-500 border-yellow-300 scale-105 cursor-pointer";
    return base + "bg-gray-700 border-gray-600 hover:bg-gray-600 cursor-pointer";
  }

  function handleClick(zone: number) {
    if (props.mode === "play" && props.disabledZone !== zone) {
      props.onZoneClick(zone);
    }
  }

  // Grid layout: 6 columns
  // Zone 1: top row, spans all 6
  // Zone 2: middle row, spans 3 left
  // Zone 3: middle row, spans 3 right
  // Zones 4,5,6: bottom row, 2 each
  const gridStyle = "grid grid-cols-6 gap-2 w-full max-w-md aspect-square";

  return (
    <div className={gridStyle}>
      {/* Zone 1 - top, spans all 6 */}
      <button
        onClick={() => handleClick(1)}
        className={zoneClasses(1) + " col-span-6 min-h-[80px]"}
        style={zoneStyle(1)}
      >
        <span className="text-2xl">Zone 1</span>
        <span className="text-sm opacity-75">{ZONE_POINTS[1]}pt</span>
        {props.mode === "heatmap" && (
          <span className="text-xs mt-1">{getHeatmapLabel(props.zoneData[1])}</span>
        )}
      </button>

      {/* Zone 2 - middle left, spans 3 */}
      <button
        onClick={() => handleClick(2)}
        className={zoneClasses(2) + " col-span-3 min-h-[80px]"}
        style={zoneStyle(2)}
      >
        <span className="text-2xl">Zone 2</span>
        <span className="text-sm opacity-75">{ZONE_POINTS[2]}pts</span>
        {props.mode === "heatmap" && (
          <span className="text-xs mt-1">{getHeatmapLabel(props.zoneData[2])}</span>
        )}
      </button>

      {/* Zone 3 - middle right, spans 3 */}
      <button
        onClick={() => handleClick(3)}
        className={zoneClasses(3) + " col-span-3 min-h-[80px]"}
        style={zoneStyle(3)}
      >
        <span className="text-2xl">Zone 3</span>
        <span className="text-sm opacity-75">{ZONE_POINTS[3]}pts</span>
        {props.mode === "heatmap" && (
          <span className="text-xs mt-1">{getHeatmapLabel(props.zoneData[3])}</span>
        )}
      </button>

      {/* Zone 4 - bottom left, spans 2 */}
      <button
        onClick={() => handleClick(4)}
        className={zoneClasses(4) + " col-span-2 min-h-[80px]"}
        style={zoneStyle(4)}
      >
        <span className="text-2xl">Zone 4</span>
        <span className="text-sm opacity-75">{ZONE_POINTS[4]}pts</span>
        {props.mode === "heatmap" && (
          <span className="text-xs mt-1">{getHeatmapLabel(props.zoneData[4])}</span>
        )}
      </button>

      {/* Zone 5 - bottom center, spans 2 */}
      <button
        onClick={() => handleClick(5)}
        className={zoneClasses(5) + " col-span-2 min-h-[80px]"}
        style={zoneStyle(5)}
      >
        <span className="text-2xl">Zone 5</span>
        <span className="text-sm opacity-75">{ZONE_POINTS[5]}pts</span>
        {props.mode === "heatmap" && (
          <span className="text-xs mt-1">{getHeatmapLabel(props.zoneData[5])}</span>
        )}
      </button>

      {/* Zone 6 - bottom right, spans 2 */}
      <button
        onClick={() => handleClick(6)}
        className={zoneClasses(6) + " col-span-2 min-h-[80px]"}
        style={zoneStyle(6)}
      >
        <span className="text-2xl">Zone 6</span>
        <span className="text-sm opacity-75">{ZONE_POINTS[6]}pts</span>
        {props.mode === "heatmap" && (
          <span className="text-xs mt-1">{getHeatmapLabel(props.zoneData[6])}</span>
        )}
      </button>
    </div>
  );
}
