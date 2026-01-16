import { ChartPanel } from "../ChartPanel";
import { useChartData, useSyncedTimeframe, useDynamicColor } from "../../utils";
import type { ChartComponentProps } from "../../data";
import { useMemo } from "react";

export const PhaseBalanceDefaults = {
  title: "Phase Balance",
  component: "PhaseBalance",
  size: 6,
};

export function PhaseBalance({
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
  const getDynamicColor = useDynamicColor();

  const handleTfChange = (val: string) => {
    setLocalTf(val);
    onTimeframeChange?.(val);
  };

  const metrics = [
    { name: "power_watts", label: "L1", tags: { site: "load", phase: "1" } },
    { name: "power_watts", label: "L2", tags: { site: "load", phase: "2" } },
  ];
  const { chartData, loading } = useChartData(metrics, localTf);

  const series = [
    { name: "Leg 1", color: getDynamicColor("L1"), unit: "W" },
    { name: "Leg 2", color: getDynamicColor("L2"), unit: "W" },
    { name: "Neutral", color: "#adb5bd", unit: "W", paths: undefined }, // Calculated delta
  ];

  const processedData = useMemo(() => {
    if (!chartData || chartData.length < 3) return chartData;
    const ts = chartData[0];
    const l1 = chartData[1];
    const l2 = chartData[2];
    const neutral = ts.map((_, i) => {
      const v1 = l1[i] ?? 0;
      const v2 = l2[i] ?? 0;
      return Math.abs(v1 - v2);
    });
    return [ts, l1, l2, neutral] as [number[], ...number[][]];
  }, [chartData]);

  return (
    <ChartPanel
      title={panel.title}
      series={series}
      data={processedData as any}
      onClick={onClick}
      timeframe={localTf}
      onTimeframeChange={handleTfChange}
      onZoom={onZoom}
      height={height}
      showLegend={showLegend}
      loading={loading}
    />
  );
}
