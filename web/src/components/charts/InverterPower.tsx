import { useState } from "react";
import { ChartPanel } from "../ChartPanel";
import { useChartData, useDynamicColor, useSyncedTimeframe } from "../../utils";
import type { ChartComponentProps } from "../../data";

export const InverterPowerDefaults = {
  title: "Inverter Power",
  component: "InverterPower",
  size: 12,
  params: { timeframe: "24h" },
};

export function InverterPower({
  panel,
  height,
  timeframe,
  onClick,
  showLegend,
  onTimeframeChange,
  onZoom,
}: ChartComponentProps) {
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
  const [localTf, setLocalTf] = useSyncedTimeframe(
    timeframe,
    panel.params?.timeframe,
  );

  const handleTfChange = (val: string) => {
    setLocalTf(val);
    setZoomRange(null);
    onTimeframeChange?.(val);
  };

  const getDynamicColor = useDynamicColor();
  // Fetch solar string power instead of inverter power
    const metrics = [{ name: 'solar_power_watts', label: 'String', all: true }];
    const { rawResults, loading } = useChartData(metrics, localTf, undefined, undefined, undefined, zoomRange);

  // Aggregate string power by inverter index
  // Keys in rawResults are like "String index=0 string=A"
  const inverterPower: Record<string, Map<number, number>> = {};
  const timestamps = new Set<number>();

  Object.keys(rawResults).forEach((key) => {
    const match = key.match(/String (\d+)/);
    if (match) {
      const invIdx = `Inverter ${match[1]}`;
      if (!inverterPower[invIdx]) inverterPower[invIdx] = new Map();

      rawResults[key].forEach((p) => {
        const current = inverterPower[invIdx].get(p.Timestamp) || 0;
        inverterPower[invIdx].set(p.Timestamp, current + p.Value);
        timestamps.add(p.Timestamp);
      });
    }
  });
  const sortedTs = Array.from(timestamps).sort((a, b) => a - b);
  const sortedInverters = Object.keys(inverterPower).sort();
  const chartData: [number[], ...number[][]] = [sortedTs];
  const series = sortedInverters.map((invName) => {
    const dataMap = inverterPower[invName];
    chartData.push(sortedTs.map((ts) => dataMap.get(ts) ?? 0));
    return {
      name: invName,
      color: getDynamicColor(invName),
      unit: "W",
    };
  });

  return (
    <ChartPanel
      title={panel.title}
      series={series}
      data={chartData}
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
      zoomRange={zoomRange}
    />
  );
}
