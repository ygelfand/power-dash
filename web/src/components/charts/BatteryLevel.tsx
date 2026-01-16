import { useState, useEffect } from "react";
import { ChartPanel } from "../ChartPanel";
import { useChartData, useDynamicColor } from "../../utils";
import type { ChartComponentProps } from "../../data";

export const BatteryLevelDefaults = {
  title: "Battery Level",
  component: "BatteryLevel",
  size: 12,
};

export function BatteryLevel({
  panel,
  height,
  timeframe,
  onClick,
  showLegend,
  onTimeframeChange,
  onZoom,
}: ChartComponentProps) {
  const [localTf, setLocalTf] = useState(panel.params?.timeframe || timeframe);

  // Sync external timeframe changes
  useEffect(() => {
    setLocalTf(timeframe);
  }, [timeframe]);

  const handleTfChange = (val: string) => {
    setLocalTf(val);
    onTimeframeChange?.(val);
  };

  const getDynamicColor = useDynamicColor();
  const metrics = [
    {
      name: "battery_energy_wh",
      label: "Pod Remaining",
      tags: { type: "remaining" },
      all: true,
    },
    {
      name: "battery_energy_wh",
      label: "Pod Capacity",
      tags: { type: "capacity" },
      all: true,
    },
  ];

  const { chartData, rawResults, loading } = useChartData(metrics, localTf);
  const series: any[] = [];
  const remainingKeys = Object.keys(rawResults)
    .filter((k) => k.includes("Remaining"))
    .sort();
  const capacityKeys = Object.keys(rawResults)
    .filter((k) => k.includes("Capacity"))
    .sort();

  // Combine them in the order useChartData does (based on metrics definition order)
  const orderedKeys = [...remainingKeys, ...capacityKeys];
  orderedKeys.forEach((key) => {
    // key is "Pod Remaining X" or "Pod Capacity X" from useChartData with label "Pod Remaining" etc
    const isRemaining = key.includes("Remaining");

    series.push({
      name: key,
      color: getDynamicColor(key),
      unit: "Wh",
      fill: isRemaining ? undefined : "none",
      stepped: true,
    });
  });
  return (
    <ChartPanel
      title={panel.title}
      series={series}
      data={chartData}
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
