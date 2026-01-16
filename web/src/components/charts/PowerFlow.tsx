import { ChartPanel } from "../ChartPanel";
import { useChartData, useSyncedTimeframe } from "../../utils";
import type { ChartComponentProps } from "../../data";
import { useState } from "react";

export const PowerFlowDefaults = {
  title: "Power Flow",
  component: "PowerFlow",
  size: 8,
  showLegend: true,
  params: { timeframe: "24h" },
};

export function PowerFlow({
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
    onTimeframeChange?.(val);
  };

  const metrics = [
    { name: "power_watts", label: "Grid", tags: { site: "site" } },
    { name: "power_watts", label: "Home", tags: { site: "load" } },
    { name: "power_watts", label: "Solar", tags: { site: "solar" } },
    { name: "power_watts", label: "Battery", tags: { site: "battery" } },
  ];

  const { chartData, loading } = useChartData(
    metrics,
    localTf,
    undefined,
    undefined,
    undefined,
    zoomRange,
  );

  const series = [
    { name: panel.params?.site || "Grid", color: "#fa5252", unit: "W" },
    { name: panel.params?.load || "Home", color: "#228be6", unit: "W" },
    { name: panel.params?.solar || "Solar", color: "#fab005", unit: "W" },
    { name: panel.params?.battery || "Battery", color: "#40c057", unit: "W" },
  ];

  return (
    <ChartPanel
      title={panel.title}
      series={series}
      data={chartData}
      onClick={(state) => onClick?.(state)}
      timeframe={localTf}
      onTimeframeChange={handleTfChange}
      onZoom={(z, range) => {
        setZoomRange(z && range ? range : null);
        onZoom?.(z);
      }}
      height={height}
      showLegend={showLegend}
      loading={loading}
    />
  );
}
