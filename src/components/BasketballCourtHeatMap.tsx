import { useEffect, useRef, useState, useCallback } from "react";
import courtImage from "../assets/tabletop-basketball.jpg";

export interface HeatmapShot {
    location: string;
    made: boolean;
}

type BasketballCourtHeatMapProps = {
    shots: HeatmapShot[];
    onZoneClick?: (zone: string) => void;
    selectedZone?: string | null;
    disabledZone?: string | null;
    title?: string;
    compact?: boolean;
    showLegend?: boolean;
    showZoneStats?: boolean;
    showQuickInsight?: boolean;
    courtMaxWidthClass?: string;
};

// Coordinates measured from the actual 1004×944 court image as percentages
const P = {
    tl: { x: 0, y: 0 },
    tr: { x: 100, y: 0 },
    bl: { x: 0, y: 100 },
    br: { x: 100, y: 100 },

    paintTL: { x: 33.9, y: 0 },
    paintTR: { x: 66.0, y: 0 },
    paintBL: { x: 33.9, y: 40.0 },
    paintBR: { x: 66.0, y: 40.0 },
    paintBMid: { x: 50, y: 40.0 },

    arcL_start: { x: 5.4, y: 0 },
    arcL_endStr: { x: 5.4, y: 29.0 },
    arcL_1: { x: 8.0, y: 35 },
    arcL_2: { x: 13.0, y: 43 },
    arcL_3: { x: 20.9, y: 51 },
    arcL_int: { x: 28.0, y: 56.0 },
    arcL_4: { x: 35.0, y: 58.8 },
    arcL_5: { x: 43.0, y: 60.9 },

    arcMid: { x: 50, y: 61.3 },

    arcR_5: { x: 57.0, y: 60.9 },
    arcR_4: { x: 65.0, y: 58.8 },
    arcR_int: { x: 71.5, y: 56.0 },
    arcR_3: { x: 79.0, y: 51 },
    arcR_2: { x: 87.0, y: 43 },
    arcR_1: { x: 92.0, y: 35 },
    arcR_endStr: { x: 94.5, y: 29.0 },
    arcR_start: { x: 94.5, y: 0 },

    diagL_bot: { x: 15.4, y: 100 },
    diagR_bot: { x: 84.0, y: 100 },
};

const ZONE_POLYGONS: Record<string, { x: number; y: number }[]> = {
    "1": [P.paintTL, P.paintTR, P.paintBR, P.paintBL],
    "2": [
        P.arcL_start,
        P.paintTL,
        P.paintBL,
        P.paintBMid,
        P.arcMid,
        P.arcL_5,
        P.arcL_4,
        P.arcL_int,
        P.arcL_3,
        P.arcL_2,
        P.arcL_1,
        P.arcL_endStr,
    ],
    "3": [
        P.paintTR,
        P.arcR_start,
        P.arcR_endStr,
        P.arcR_1,
        P.arcR_2,
        P.arcR_3,
        P.arcR_int,
        P.arcR_4,
        P.arcR_5,
        P.arcMid,
        P.paintBMid,
        P.paintBR,
    ],
    "4": [
        P.tl,
        P.arcL_start,
        P.arcL_endStr,
        P.arcL_1,
        P.arcL_2,
        P.arcL_3,
        P.arcL_int,
        P.diagL_bot,
        P.bl,
    ],
    "5": [
        P.arcL_int,
        P.arcL_4,
        P.arcL_5,
        P.arcMid,
        P.arcR_5,
        P.arcR_4,
        P.arcR_int,
        P.diagR_bot,
        P.diagL_bot,
    ],
    "6": [
        P.arcR_start,
        P.tr,
        P.br,
        P.diagR_bot,
        P.arcR_int,
        P.arcR_3,
        P.arcR_2,
        P.arcR_1,
        P.arcR_endStr,
    ],
};

const ZONE_LABELS: Record<string, string> = {
    "1": "Paint",
    "2": "Left Wing",
    "3": "Right Wing",
    "4": "Left Corner",
    "5": "Top of Key",
    "6": "Right Corner",
};

function pointInPolygon(
    px: number,
    py: number,
    polygon: { x: number; y: number }[],
): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x,
            yi = polygon[i].y;
        const xj = polygon[j].x,
            yj = polygon[j].y;
        if (
            yi > py !== yj > py &&
            px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
        ) {
            inside = !inside;
        }
    }
    return inside;
}

function getHeatmapColor(percentage: number, alpha = 0.75) {
    const normalized = Math.max(0, Math.min(percentage, 1));
    const hue = normalized * 120;
    return `hsla(${hue}, 70%, 50%, ${alpha})`;
}

function getZoneCardTextColor(percentage: number, total: number) {
    if (total === 0) return "#9ca3af";
    return percentage >= 35 && percentage <= 65 ? "#111827" : "#ffffff";
}

/** Convert ZoneGrid-style data to HeatmapShot[] */
export function zoneDataToShots(
    zoneData: Record<number, { makes: number; misses: number }>,
): HeatmapShot[] {
    const result: HeatmapShot[] = [];
    for (const [zone, data] of Object.entries(zoneData)) {
        for (let i = 0; i < data.makes; i++)
            result.push({ location: zone, made: true });
        for (let i = 0; i < data.misses; i++)
            result.push({ location: zone, made: false });
    }
    return result;
}

export default function BasketballCourtHeatMap({
    shots,
    onZoneClick,
    selectedZone,
    disabledZone,
    title = "Court Heat Map - Shooting Accuracy",
    compact = false,
    showLegend = true,
    showZoneStats = true,
    showQuickInsight = true,
    courtMaxWidthClass,
}: BasketballCourtHeatMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const update = () => {
            if (containerRef.current) {
                const w = containerRef.current.clientWidth;
                const h = containerRef.current.clientHeight;
                if (w > 0 && h > 0) setDimensions({ width: w, height: h });
            }
        };

        update();
        const ro = new ResizeObserver(update);
        if (containerRef.current) ro.observe(containerRef.current);
        window.addEventListener("resize", update);

        return () => {
            ro.disconnect();
            window.removeEventListener("resize", update);
        };
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || dimensions.width === 0 || dimensions.height === 0)
            return;

        canvas.width = dimensions.width;
        canvas.height = dimensions.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const zoneStats = Object.keys(ZONE_POLYGONS).map((zone) => {
            const zoneShots = shots.filter((s) => s.location === zone);
            const made = zoneShots.filter((s) => s.made).length;
            const total = zoneShots.length;
            const pct = total > 0 ? made / total : 0;
            return { zone, pct, total };
        });

        ctx.globalCompositeOperation = "multiply";

        zoneStats.forEach(({ zone, pct, total }) => {
            if (total === 0) return;

            const points = ZONE_POLYGONS[zone];
            ctx.beginPath();
            points.forEach((p, index) => {
                const x = (p.x / 100) * dimensions.width;
                const y = (p.y / 100) * dimensions.height;
                if (index === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.closePath();
            ctx.fillStyle = getHeatmapColor(pct);
            ctx.fill();
        });

        ctx.globalCompositeOperation = "source-over";

        if (selectedZone && ZONE_POLYGONS[selectedZone]) {
            const points = ZONE_POLYGONS[selectedZone];
            ctx.beginPath();
            points.forEach((p, index) => {
                const x = (p.x / 100) * dimensions.width;
                const y = (p.y / 100) * dimensions.height;
                if (index === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.closePath();
            ctx.strokeStyle = "rgba(37, 99, 235, 0.95)";
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
            ctx.fill();
        }

        if (disabledZone && ZONE_POLYGONS[disabledZone]) {
            const points = ZONE_POLYGONS[disabledZone];
            ctx.beginPath();
            points.forEach((p, index) => {
                const x = (p.x / 100) * dimensions.width;
                const y = (p.y / 100) * dimensions.height;
                if (index === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.closePath();
            ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
            ctx.fill();
        }
    }, [shots, dimensions, selectedZone, disabledZone]);

    const handleCanvasClick = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            if (!onZoneClick || !containerRef.current) return;

            const rect = containerRef.current.getBoundingClientRect();
            const clickX = ((e.clientX - rect.left) / rect.width) * 100;
            const clickY = ((e.clientY - rect.top) / rect.height) * 100;

            for (const [zone, polygon] of Object.entries(ZONE_POLYGONS)) {
                if (pointInPolygon(clickX, clickY, polygon)) {
                    if (zone === disabledZone) return;
                    onZoneClick(zone);
                    return;
                }
            }
        },
        [onZoneClick, disabledZone],
    );

    const zoneStats = Object.keys(ZONE_POLYGONS).map((zone) => {
        const zoneShots = shots.filter((s) => s.location === zone);
        const made = zoneShots.filter((s) => s.made).length;
        const total = zoneShots.length;
        const percentage = total > 0 ? Math.round((made / total) * 100) : 0;
        return { zone, label: ZONE_LABELS[zone], made, total, percentage };
    });

    const isBare = !title && !showLegend && !showZoneStats && !showQuickInsight;
    const containerClasses = isBare
        ? ""
        : compact
          ? "bg-gray-900 rounded-2xl p-4 border-2 border-gray-700 shadow-xl"
          : "bg-gray-900 rounded-3xl p-8 border-4 border-gray-700 shadow-2xl";
    const headingClasses = compact
        ? "text-xl font-bold text-white mb-4"
        : "text-3xl font-bold text-white mb-6";
    const legendWrapperClasses = compact
        ? "flex items-center justify-center gap-3 mb-4 pb-4 border-b border-gray-700"
        : "flex items-center justify-center gap-4 mb-6 pb-6 border-b-2 border-gray-700";
    const gradientClasses = compact
        ? "h-8 w-40 rounded-lg border-2 border-gray-700"
        : "h-12 w-56 rounded-lg border-4 border-gray-700";
    const legendScaleClasses = compact
        ? "flex items-center justify-center gap-4 mb-4 text-xs font-semibold text-gray-300"
        : "flex items-center justify-center gap-6 mb-6 text-sm font-semibold text-gray-300";
    const courtClasses = `relative mx-auto ${courtMaxWidthClass ?? (compact ? "max-w-xl" : "max-w-4xl")}`;
    const courtFrameClasses = compact
        ? "relative rounded-xl overflow-hidden border-2 border-gray-800 shadow-xl"
        : "relative rounded-2xl overflow-hidden border-4 border-gray-800 shadow-2xl";
    const emptyStateClasses = compact
        ? "text-white text-lg font-bold text-center px-4"
        : "text-white text-2xl font-bold text-center px-6";
    const emptyStateSubtextClasses = compact
        ? "text-sm mt-2 opacity-90"
        : "text-lg mt-3 opacity-90";
    const statsGridClasses = compact
        ? "grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4"
        : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 mt-8";
    const statCardClasses = compact
        ? "border-2 rounded-lg p-3 text-center transition-all hover:scale-[1.02]"
        : "border-4 rounded-xl p-4 text-center transition-all hover:scale-105";
    const insightClasses = compact
        ? "mt-4 bg-gradient-to-r from-blue-900/40 to-purple-900/40 rounded-xl p-4 border border-blue-800/50"
        : "mt-8 bg-gradient-to-r from-blue-900/40 to-purple-900/40 rounded-2xl p-6 border border-blue-800/50";

    return (
        <div className={containerClasses}>
            {title && <h3 className={headingClasses}>{title}</h3>}

            {showLegend && (
                <>
                    <div className={legendWrapperClasses}>
                        <div
                            className={`${compact ? "text-xs" : "text-sm"} font-bold text-gray-300`}
                        >
                            Miss-Heavy
                        </div>
                        <div
                            className={gradientClasses}
                            style={{
                                background:
                                    "linear-gradient(90deg, #ef4444 0%, #facc15 50%, #22c55e 100%)",
                            }}
                        />
                        <div
                            className={`${compact ? "text-xs" : "text-sm"} font-bold text-gray-300`}
                        >
                            Make-Heavy
                        </div>
                    </div>

                    <div className={legendScaleClasses}>
                        <div>0% made</div>
                        <div className="text-gray-500">50% made</div>
                        <div>100% made</div>
                    </div>
                </>
            )}

            <div className={courtClasses}>
                <div
                    ref={containerRef}
                    className={courtFrameClasses}
                    style={{ width: "100%", aspectRatio: "1004 / 944" }}
                >
                    <img
                        src={courtImage}
                        alt="Basketball court"
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{ zIndex: 1 }}
                    />

                    <canvas
                        ref={canvasRef}
                        className={`absolute inset-0 ${onZoneClick ? "cursor-pointer" : "pointer-events-none"}`}
                        style={{ zIndex: 10 }}
                        onClick={onZoneClick ? handleCanvasClick : undefined}
                    />

                    {shots.length === 0 && !onZoneClick && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-20">
                            <div className={emptyStateClasses}>
                                No shots recorded yet
                                <div className={emptyStateSubtextClasses}>
                                    Log some shots to see your shooting heatmap!
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {showZoneStats && (
                <div className={statsGridClasses}>
                    {zoneStats.map((stat) => (
                        <div
                            key={stat.zone}
                            className={statCardClasses}
                            style={
                                stat.total === 0
                                    ? {
                                          backgroundColor: "#1f2937",
                                          borderColor: "#374151",
                                          color: "#9ca3af",
                                      }
                                    : {
                                          backgroundColor: getHeatmapColor(
                                              stat.percentage / 100,
                                              0.9,
                                          ),
                                          borderColor: getHeatmapColor(
                                              stat.percentage / 100,
                                              1,
                                          ),
                                          color: getZoneCardTextColor(
                                              stat.percentage,
                                              stat.total,
                                          ),
                                      }
                            }
                        >
                            <div
                                className={`${compact ? "text-base" : "text-xl"} font-bold mb-1`}
                            >
                                Zone {stat.zone}
                            </div>
                            <div
                                className={`${compact ? "text-xs" : "text-sm"} font-medium mb-2 opacity-90`}
                            >
                                {stat.label}
                            </div>
                            <div
                                className={`${compact ? "text-2xl" : "text-4xl"} font-extrabold mb-1`}
                            >
                                {stat.percentage}%
                            </div>
                            <div
                                className={`${compact ? "text-xs" : "text-sm"} font-semibold`}
                            >
                                {stat.made} / {stat.total}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showQuickInsight && shots.length > 0 && (
                <div className={insightClasses}>
                    <div
                        className={`${compact ? "text-base" : "text-lg"} font-bold text-white mb-2`}
                    >
                        Quick Insight:
                    </div>
                    <div
                        className={`${compact ? "text-sm" : "text-base"} text-gray-200 leading-relaxed`}
                    >
                        {(() => {
                            const zonesWithData = zoneStats.filter(
                                (z) => z.total > 0,
                            );
                            if (zonesWithData.length === 0)
                                return "No data yet.";
                            const best = zonesWithData.reduce((a, b) =>
                                a.percentage > b.percentage ? a : b,
                            );
                            const worst = zonesWithData.reduce((a, b) =>
                                a.percentage < b.percentage ? a : b,
                            );
                            return (
                                <>
                                    Strongest from{" "}
                                    <strong>
                                        Zone {best.zone} ({best.label})
                                    </strong>{" "}
                                    at {best.percentage}%.
                                    {best.zone !== worst.zone && (
                                        <>
                                            {" "}
                                            Practice more on{" "}
                                            <strong>
                                                Zone {worst.zone} ({worst.label}
                                                )
                                            </strong>{" "}
                                            ({worst.percentage}%).
                                        </>
                                    )}
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}
        </div>
    );
}
