import { ChartPanel } from "../ChartPanel";
import { useChartData, useSyncedTimeframe, useDynamicColor } from "../../utils";
import type { ChartComponentProps } from "../../data";
import { useState } from "react";

export const GridFrequencyDefaults = {
  title: "Frequency",
  component: "GridFrequency",
  size: 6,
};

export function GridFrequency({
  panel,
  height,
  timeframe,
  onClick,
  showLegend,
  onTimeframeChange,
  onZoom,
}: ChartComponentProps) {
  const [localTf, setLocalTf] = useSyncedTimeframe(
    timeframe,
    panel.params?.timeframe,
  );
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
  const getDynamicColor = useDynamicColor();

  const handleTfChange = (val: string) => {
    setLocalTf(val);
    setZoomRange(null);
    onTimeframeChange?.(val);
  };

  const metrics = [
    { name: "frequency_hertz", label: "Site", all: true },
    { name: "inverter_frequency_hertz", label: "Inverter", all: true },
  ];
  const { rawResults, loading } = useChartData(
    metrics,
    localTf,
    undefined,
    undefined,
    undefined,
    zoomRange,
  );

  const activeSeries: any[] = [];

  const timestamps = new Set<number>();

  if (rawResults) {
    Object.values(rawResults).forEach((pts) =>
      pts.forEach((p) => timestamps.add(p.Timestamp)),
    );
  }

  const sortedTs = Array.from(timestamps).sort((a, b) => a - b);

  const chartData: [(number | null)[], ...(number | null)[][]] = [sortedTs];

  if (rawResults) {
    Object.keys(rawResults)
      .sort()
      .forEach((key) => {
        const pts = rawResults[key];

        const dataMap = new Map(pts.map((p) => [p.Timestamp, p.Value]));

        const hasData = pts.some((p) => p.Value !== 0);

        if (hasData) {
          // Format name

          let name = key;

          // Parse key like "Site site=load" -> "Load"

          if (key.startsWith("Site")) {
            if (key.includes("site=load")) name = "Load";
            else if (key.includes("site=site")) name = "Grid";
          } else if (key.startsWith("Inverter")) {
            // "Inverter index=0" -> "Inverter 0"

            const match = key.match(/index=(\d+)/);

            if (match) name = `Inverter ${match[1]}`;
          }

          activeSeries.push({
            name: name,

            color: getDynamicColor(name),

            unit: "Hz",
          });

          // Align data

          const aligned = sortedTs.map((ts) => {
            const val = dataMap.get(ts);
            return val !== undefined && val !== 0 ? val : null;
          });
          chartData.push(aligned);
        }
      });
  }

  return (
    <ChartPanel
      title={panel.title}
      series={activeSeries}
      data={chartData as any}
      onClick={onClick}
      timeframe={localTf}
      onTimeframeChange={handleTfChange}
      onZoom={(z, range) => {
        setZoomRange(z && range ? range : null);
        onZoom?.(z);
      }}
      height={height}
      showLegend={showLegend}
      loading={loading}
      autoScale={true}
      spanGaps={true}
      zoomRange={zoomRange}
    />
  );
}
