import { useState, useEffect, useRef } from "react";
import { useMantineTheme } from "@mantine/core";
import { batchQueryMetrics } from "./data";
import type { DataPoint, MetricQuery } from "./data";
import { useRefresh } from "./contexts/RefreshContext";

export function parseTimeframe(tf: string): number {
  if (tf === "all") return 86400 * 365 * 10;
  const num = parseInt(tf.slice(0, -1));
  const unit = tf.slice(-1);
  switch (unit) {
    case "h":
      return num * 3600;
    case "d":
      return num * 86400;
    case "w":
      return num * 86400 * 7;
    case "m":
      return num * 86400 * 30;
    case "y":
      return num * 86400 * 365;
    case "all":
      return 86400 * 365 * 10;
    default:
      return 3600;
  }
}

export function alignTimestamps(
  results: Record<string, DataPoint[]>,
): number[] {
  const timestamps = new Set<number>();
  Object.values(results).forEach((pts) => {
    pts.forEach((p) => timestamps.add(p.Timestamp));
  });
  return Array.from(timestamps).sort((a, b) => a - b);
}

// Hook to get a dynamic color from the theme based on a string input
export function useDynamicColor() {
  const theme = useMantineTheme();

  // Flatten theme colors into a single palette array
  // Use shades 1, 3, 5, and 7 from all color families for variety
  const palette = Object.entries(theme.colors)
    .filter(([name]) => name !== "dark")
    .flatMap(([, shades]) => [shades[1], shades[3], shades[5], shades[7]]);

  return (input: string | number): string => {
    let hash = 0;
    const str = String(input);
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % palette.length;
    return palette[index];
  };
}

export function getContrastingTextColor(hex: string): string {
  if (!hex || !hex.startsWith("#")) return "black";
  const r = parseInt(hex.substr(1, 2), 16);
  const g = parseInt(hex.substr(3, 2), 16);
  const b = parseInt(hex.substr(5, 2), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "black" : "white";
}

export function useSyncedTimeframe(
  propTimeframe: string,
  defaultTimeframe?: string,
  onSync?: (tf: string) => void,
): [string, (tf: string) => void] {
  const [prevPropTf, setPrevPropTf] = useState(propTimeframe);
  const [localTf, setLocalTf] = useState(defaultTimeframe || propTimeframe);

  if (propTimeframe !== prevPropTf) {
    setPrevPropTf(propTimeframe);
    setLocalTf(propTimeframe);
    onSync?.(propTimeframe);
  }

  return [localTf, setLocalTf];
}

export function useDataRefresh(
  callback: () => void,
  intervalMs: number,
  dependencies: any[] = [],
) {
  const { isPaused } = useRefresh();
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Trigger fetch whenever dependencies change (e.g. timeframe, metrics) or on mount
  useEffect(() => {
    savedCallback.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  // Manage periodic refresh interval
  useEffect(() => {
    if (isPaused) return;
    const id = setInterval(() => savedCallback.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, isPaused]);
}

export function useChartData(
  metrics: MetricQuery[],
  timeframe: string,
  explicitIntervalMs?: number,
  step?: number,
  func?: string,
  zoomRange?: [number, number] | null,
) {
  const [chartData, setChartData] = useState<
    [number[], ...number[][]] | undefined
  >();
  const [loading, setLoading] = useState(true);
  const [rawResults, setRawResults] = useState<Record<string, DataPoint[]>>({});

  const metricsStr = JSON.stringify(metrics);
  const zoomRangeStr = JSON.stringify(zoomRange);

  // Determine refresh interval based on timeframe if not explicit
  let intervalMs = 30000; // Default 30s
  if (explicitIntervalMs !== undefined) {
    intervalMs = explicitIntervalMs;
  } else {
    if (timeframe.endsWith("m") || timeframe === "30d") {
      intervalMs = 3600000; // 1 hour for monthly
    } else if (timeframe.endsWith("y")) {
      intervalMs = 86400000; // 1 day for yearly
    }
  }

  const fetchData = async () => {
    // Don't set loading on background refresh to avoid flicker
    if (!chartData) setLoading(true);
    let start: number, end: number;

    if (zoomRange) {
      // Use the zoomed range
      [start, end] = zoomRange;
      // Ensure integers
      start = Math.floor(start);
      end = Math.ceil(end);
    } else {
      // Use the selected timeframe
      const duration = parseTimeframe(timeframe);
      end = Math.floor(Date.now() / 1000);
      start = end - duration;
    }

    const duration = end - start;

    // Auto-calculate step to target ~1000 points
    // If duration is small enough (<= 7 days), request full precision (step=0)
    // Otherwise, downsample.
    const queryStep =
      step !== undefined
        ? step
        : duration > 86400 * 7
          ? Math.max(1, Math.floor(duration / 1000))
          : 0;

    try {
      const results = await batchQueryMetrics(
        metrics,
        start,
        end,
        queryStep,
        func,
      );
      setRawResults(results);

      const sortedTs = alignTimestamps(results);
      const data: (number[] | (number | null)[])[] = [sortedTs];

      const seriesKeys: string[] = [];
      metrics.forEach((m) => {
        if (m.all) {
          const matchingKeys = Object.keys(results)
            .filter((k) => k.startsWith(m.label))
            .sort();
          seriesKeys.push(...matchingKeys);
        } else {
          seriesKeys.push(m.label);
        }
      });

      seriesKeys.forEach((k) => {
        const ptsMap = new Map(
          (results[k] || []).map((p) => [p.Timestamp, p.Value]),
        );
        const alignedData = sortedTs.map((ts) => {
          const val = ptsMap.get(ts);
          return val !== undefined ? val : null;
        });
        data.push(alignedData);
      });
      setChartData(data as [number[], ...number[][]] | undefined);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Unified fetch and periodic refresh
  useDataRefresh(fetchData, intervalMs, [
    timeframe,
    metricsStr,
    step,
    func,
    zoomRangeStr,
  ]);

  return { chartData, loading, rawResults };
}
