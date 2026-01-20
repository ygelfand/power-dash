import { useMantineColorScheme, Text, Box, Center } from "@mantine/core";
import { useElementSize, useDebouncedValue, useMediaQuery } from "@mantine/hooks";
import UplotReact from "uplot-react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useMemo, useState, useEffect, useRef } from "react";
import { parseTimeframe } from "../utils";
import classes from "./ChartPanel.module.css";
import { useLabels } from "../contexts/LabelContext";

interface BaseSeriesConfig {
  name: string;
  color: string;
  paths?: uPlot.Series.Paths;
  unit?: string;
  fill?: string;
  stepped?: boolean;
}

interface BaseChartProps {
  data?: [number[], ...number[][]];
  series: BaseSeriesConfig[];
  height?: number;
  timeframe: string;
  tooltipFormat?: "date" | "datetime";
  convertFunc?: (val: number) => number;
  onCreate?: (u: uPlot) => void;
  onZoom?: (isZoomed: boolean, range?: [number, number]) => void;
  onClick?: () => void;
  isZoomed?: boolean;
  showLegend?: boolean;
  zoomRange?: [number, number] | null;
  autoScale?: boolean;
  spanGaps?: boolean;
}

function formatValue(val: number, unit?: string): string {
  if (val === null || isNaN(val)) return "-";
  if (!unit) return val.toFixed(2);

  if (unit === "W" || unit === "Wh") {
    const abs = Math.abs(val);
    if (abs >= 1000000) return `${(val / 1000000).toFixed(2)} M${unit}`;
    if (abs >= 1000) return `${(val / 1000).toFixed(2)} k${unit}`;
    return `${val.toFixed(0)} ${unit}`;
  }
  if (unit === "%") return `${val.toFixed(1)}%`;
  return `${val.toFixed(2)} ${unit}`;
}

function getFillColor(color: string): string {
  if (color.startsWith("hsl")) {
    return color.replace(")", ", 0.2)").replace("hsl", "hsla");
  }
  return color + "33";
}

function calculateStats(vals: (number | null)[]) {
  if (!vals || vals.length === 0) return { min: 0, max: 0, avg: 0 };

  let firstVal: number | null = null;
  for (const v of vals) {
    if (v !== null && !isNaN(v)) {
      firstVal = v;
      break;
    }
  }

  if (firstVal === null) return { min: 0, max: 0, avg: 0 };

  let min = firstVal,
    max = firstVal,
    sum = 0;
  let count = 0;
  vals.forEach((v) => {
    if (v == null || isNaN(v)) return;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    count++;
  });
  return { min, max, avg: count > 0 ? sum / count : 0 };
}

export function BaseChart({
  data: externalData,
  series,
  height: fixedHeight = 250,
  timeframe,
  tooltipFormat = "datetime",
  convertFunc,
  onCreate,
  onZoom,
  onClick,
  isZoomed = false,
  showLegend = false,
  zoomRange,
  autoScale = false,
  spanGaps = false,
}: BaseChartProps) {
  const { colorScheme } = useMantineColorScheme();
  const { getLabel } = useLabels();
  const { ref, width: rawWidth } = useElementSize();
  const [width] = useDebouncedValue(rawWidth, 100);
  const isDark = colorScheme === "dark";
  const isMobile = useMediaQuery("(max-width: 48em)");
  const effectiveShowLegend = showLegend && !isMobile;

  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const interval = setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      30000,
    );
    return () => clearInterval(interval);
  }, []);

  const [legendData, setLegendData] = useState<
    { label: string; value: number; color: string; unit?: string }[]
  >([]);
  const [showTooltip, setShowTooltip] = useState(false);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [uplot, setUplot] = useState<uPlot | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const [visibleRange, setVisibleRange] = useState<[number, number] | null>(
    zoomRange || null,
  );
  const visibleRangeRef = useRef<[number, number] | null>(zoomRange || null);
  const lastIdx = useRef<number | null>(null);

  // Synchronous state refs to prevent race conditions during interaction/re-renders
  const isZoomedRef = useRef(isZoomed);
  const timeframeRef = useRef(timeframe);
  const zoomRangeRef = useRef(zoomRange);

  // Sync refs immediately during render
  isZoomedRef.current = isZoomed;
  timeframeRef.current = timeframe;
  zoomRangeRef.current = zoomRange;

  // If zoom is disabled from outside, clear our internal tracking
  useEffect(() => {
    if (!isZoomed) {
      setVisibleRange(null);
      visibleRangeRef.current = null;
    }
  }, [isZoomed]);

  // If we have a zoomRange prop change, update internal range
  useEffect(() => {
    if (zoomRange) {
      setVisibleRange(zoomRange);
      visibleRangeRef.current = zoomRange;
    }
  }, [JSON.stringify(zoomRange)]);

  const onCreateRef = useRef(onCreate);
  const onZoomRef = useRef(onZoom);
  onCreateRef.current = onCreate;
  onZoomRef.current = onZoom;

  const _setIsZoomed = (v: boolean) => {
    isZoomedRef.current = v;
    onZoomRef.current?.(v);
  };

  const toggleSeries = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newHidden = new Set(hiddenSeries);
    if (e.shiftKey) {
      if (newHidden.has(name)) newHidden.delete(name);
      else newHidden.add(name);
    } else {
      if (hiddenSeries.size === series.length - 1 && !hiddenSeries.has(name)) {
        newHidden.clear();
      } else {
        newHidden.clear();
        series.forEach((s) => {
          if (s.name !== name) newHidden.add(s.name);
        });
      }
    }
    setHiddenSeries(newHidden);
  };

  useEffect(() => {
    if (uplot) {
      series.forEach((s, i) => {
        uplot.setSeries(i + 1, { show: !hiddenSeries.has(s.name) });
      });
    }
  }, [uplot, hiddenSeries, series]);

  useEffect(() => {
    if (uplot && width > 0) {
      const legendWidth = effectiveShowLegend ? 250 : 0;
      uplot.setSize({
        width: Math.max(100, width - legendWidth),
        height: fixedHeight,
      });
      uplot.redraw();
    }
  }, [uplot, width, fixedHeight, effectiveShowLegend]);

  const data = useMemo(() => {
    if (externalData) {
      if (convertFunc) {
        return [
          externalData[0],
          ...externalData.slice(1).map((sd) => sd.map((v) => convertFunc(v))),
        ] as [number[], ...number[][]];
      }
      return externalData;
    }
    return [[]] as unknown as [number[], ...number[][]];
  }, [externalData, convertFunc]);

  const uniqueUnits = useMemo(
    () =>
      Array.from(
        new Set(series.map((s) => s.unit).filter(Boolean)),
      ) as string[],
    [series],
  );

  const stats = useMemo(() => {
    if (!data || data.length < 2) return [];
    const timestamps = data[0];
    let startIdx = 0;
    let endIdx = timestamps.length - 1;
    if (visibleRange) {
      const [min, max] = visibleRange;
      for (let i = 0; i < timestamps.length; i++) {
        if (timestamps[i] >= min) {
          startIdx = i;
          break;
        }
      }
      for (let i = timestamps.length - 1; i >= 0; i--) {
        if (timestamps[i] <= max) {
          endIdx = i;
          break;
        }
      }
    }
    if (startIdx > endIdx) return [];
    return series.map((s, i) => {
      const vals = data[i + 1].slice(startIdx, endIdx + 1) as (number | null)[];
      return {
        name: s.name,
        color: s.color,
        unit: s.unit,
        ...calculateStats(vals),
      };
    });
  }, [data, series, visibleRange]);

  const options = useMemo<uPlot.Options>(() => {
    const axes: uPlot.Axis[] = [
      {
        stroke: isDark ? "#c1c2c5" : "#5c5f66",
        grid: { stroke: isDark ? "#373a40" : "#dee2e6", width: 1 },
        ticks: { stroke: isDark ? "#c1c2c5" : "#5c5f66" },
        space: 80,
      },
    ];

    const scales: uPlot.Scales = {
      x: {
        time: true,
        range: (_u, _dataMin, dataMax) => {
          if (isZoomedRef.current && visibleRangeRef.current)
            return visibleRangeRef.current;
          if (zoomRangeRef.current) return zoomRangeRef.current;

          const duration = parseTimeframe(timeframeRef.current);
          const end = Math.max(Math.floor(Date.now() / 1000), dataMax || 0);
          return [end - duration, end];
        },
      },
    };

    if (series.some((s) => !s.unit)) {
      scales.y = {
        range: autoScale
          ? undefined
          : (_u, min, max) => [
              min < 0 ? min * 1.1 : 0,
              max > 0 ? max * 1.2 : 100,
            ],
      };
      axes.push({
        scale: "y",
        side: 3,
        stroke: isDark ? "#c1c2c5" : "#5c5f66",
        size: 80,
        grid: { show: true, stroke: isDark ? "#373a40" : "#dee2e6" },
        values: (_u, vals) => vals.map((v) => formatValue(v)),
      });
    }

    uniqueUnits.forEach((u, i) => {
      const scaleKey = u === "%" ? "percent" : u;
      if (scales[scaleKey]) return;
      scales[scaleKey] = {
        range:
          u === "%"
            ? () => [0, 100]
            : autoScale
              ? undefined
              : (_u, min, max) => [
                  min < 0 ? min * 1.1 : 0,
                  max > 0 ? max * 1.2 : 100,
                ],
      };
      axes.push({
        scale: scaleKey,
        side: (scales.y ? i + 1 : i) % 2 === 0 ? 3 : 1,
        stroke: isDark ? "#c1c2c5" : "#5c5f66",
        size: 80,
        grid: {
          show: !scales.y && i === 0,
          stroke: isDark ? "#373a40" : "#dee2e6",
        },
        values: (_u, vals) => vals.map((v) => formatValue(v, u)),
      });
    });

    return {
      width: width || 400,
      height: fixedHeight,
      padding: [24, 10, 0, 10],
      scales,
      hooks: {
        setCursor: [
          (u) => {
            const { idx, left, top } = u.cursor;
            if (idx != null && left != null && top != null) {
              if (tooltipRef.current) {
                const chartWidth = u.width;
                const tooltipHeight = tooltipRef.current.offsetHeight || 150;
                const xOffset = left + 20;
                let yOffset = top - tooltipHeight - 10;
                if (yOffset < 0) yOffset = top + 20;
                const finalX =
                  xOffset + 220 > chartWidth ? left - 230 : xOffset;
                tooltipRef.current.style.transform = `translate(${finalX}px, ${yOffset}px)`;
              }

              if (idx !== lastIdx.current) {
                lastIdx.current = idx;
                const currentLegendData = series
                  .map((s, i) => ({
                    label: getLabel(s.name),
                    value: u.data[i + 1][idx] as number,
                    color: s.color,
                    unit: s.unit,
                  }))
                  .filter((item) => item.value !== null);

                setLegendData(currentLegendData);
                const date = new Date((u.data[0][idx] as number) * 1000);
                const dateStr = date.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });
                const timeStr = date.toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                });
                setActiveDate(
                  tooltipFormat === "datetime"
                    ? `${dateStr} ${timeStr}`
                    : dateStr,
                );
                setShowTooltip(currentLegendData.length > 0);
              }
            } else {
              setShowTooltip(false);
              lastIdx.current = null;
            }
          },
        ],
        setSelect: [
          (u) => {
            if (u.select.width > 0) {
              const min = u.posToVal(u.select.left, "x") as number;
              const max = u.posToVal(
                u.select.left + u.select.width,
                "x",
              ) as number;

              // Immediately lock the source of truth ref
              const newRange: [number, number] = [min, max];
              visibleRangeRef.current = newRange;
              setVisibleRange(newRange);
              isZoomedRef.current = true;
              u.setScale("x", { min, max });
              u.setSelect({ width: 0, height: 0, top: 0, left: 0 }, true);
              _setIsZoomed(true);
              onZoomRef.current?.(true, newRange);
            }
          },
        ],
      },
      series: [
        {},
        ...series.map((s) => ({
          label: getLabel(s.name),
          scale: s.unit === "%" ? "percent" : s.unit || "y",
          stroke: s.color,
          width: 2,
          spanGaps: spanGaps,
          paths:
            s.paths ||
            (s.stepped ? uPlot.paths.stepped!({ align: 1 }) : undefined),
          points: { show: false },
          value: (_u: uPlot, v: number) => formatValue(v, s.unit),
          fill: s.paths
            ? undefined
            : s.fill === "none"
              ? undefined
              : getFillColor(s.color),
        })),
      ],
      axes,
      legend: { show: false },
      cursor: { x: false, y: false, drag: { x: true, y: false } },
    };
  }, [
    isDark,
    tooltipFormat,
    autoScale,
    width,
    fixedHeight,
    series,
    spanGaps,
    now,
    uniqueUnits,
    isZoomed,
    JSON.stringify(zoomRange),
  ]);

  const hasData =
    externalData && externalData.length > 0 && externalData[0].length > 0;
  if (!hasData && externalData)
    return (
      <Center h={fixedHeight}>
        <Text c="dimmed">No data in this timeframe</Text>
      </Center>
    );

  return (
    <Box
      ref={ref}
      className={`${classes.chartContainer} ${onClick ? classes.interactive : ""}`}
      style={{ minHeight: fixedHeight }}
      onClick={onClick}
    >
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <div style={{ flexGrow: 1, minWidth: 0 }}>
          {width > 0 && (
            <UplotReact
              key={`${isDark}-${series.length}-${JSON.stringify(uniqueUnits)}-${timeframe}-${isZoomed}-${JSON.stringify(zoomRange)}`}
              options={options}
              data={data}
              resetScales={false}
              onCreate={(u) => {
                setUplot(u);
                onCreateRef.current?.(u);
              }}
            />
          )}
        </div>

        {effectiveShowLegend && stats.length > 0 && (
          <div className={classes.sidebarLegend}>
            {stats.map((s) => {
              const isHidden = hiddenSeries.has(s.name);
              return (
                <div
                  key={s.name}
                  className={`${classes.legendRow} ${isHidden ? classes.legendRowHidden : ""}`}
                  onClick={(e) => toggleSeries(s.name, e)}
                >
                  <div className={classes.legendHeader}>
                    <div
                      className={classes.legendColor}
                      style={{
                        backgroundColor: isHidden ? "#adb5bd" : s.color,
                      }}
                    />
                    <Text size="xs" fw={700} truncate>
                      {getLabel(s.name)}
                    </Text>
                  </div>
                  <div className={classes.legendStats}>
                    <div className={classes.statItem}>
                      <Text size="xs" c="dimmed">
                        min
                      </Text>
                      <Text size="xs" fw={500}>
                        {formatValue(s.min, s.unit)}
                      </Text>
                    </div>
                    <div className={classes.statItem}>
                      <Text size="xs" c="dimmed">
                        max
                      </Text>
                      <Text size="xs" fw={500}>
                        {formatValue(s.max, s.unit)}
                      </Text>
                    </div>
                    <div className={classes.statItem}>
                      <Text size="xs" c="dimmed">
                        avg
                      </Text>
                      <Text size="xs" fw={500}>
                        {formatValue(s.avg, s.unit)}
                      </Text>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showTooltip && legendData.length > 0 && (
        <div
          ref={tooltipRef}
          className={`${classes.tooltip} ${isZoomed ? classes.tooltipZoomed : ""}`}
          style={{ pointerEvents: "none" }}
        >
          {activeDate && (
            <Text size="xs" fw={700} mb={4} className={classes.tooltipTitle}>
              {activeDate}
            </Text>
          )}
          {legendData.map((item, i) => (
            <div key={i} className={classes.legendItem}>
              <div
                className={classes.legendColor}
                style={{ backgroundColor: item.color }}
              />
              <Text size="xs" fw={500}>
                {item.label}: {formatValue(item.value, item.unit)}
              </Text>
            </div>
          ))}
        </div>
      )}
    </Box>
  );
}
