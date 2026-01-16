import { ChartPanel } from "../ChartPanel";
import { useChartData, useSyncedTimeframe, useDynamicColor } from "../../utils";
import type { ChartComponentProps } from "../../data";
import { useState } from "react";

export const GridVoltageDefaults = {
  title: "Voltage",
  component: "GridVoltage",
  size: 6,
  params: { timeframe: "24h" },
};

export function GridVoltage({
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
    { name: "voltage_volts", label: "Grid", tags: { site: "site" }, all: true },
    { name: "voltage_volts", label: "Load", tags: { site: "load" }, all: true },
    { name: "voltage_volts", label: "MSA", tags: { site: "msa" }, all: true },
    { name: "inverter_voltage_volts", label: "Inverter", all: true },
  ];
  const { chartData, rawResults, loading } = useChartData(
    metrics,
    localTf,
    undefined,
    undefined,
    undefined,
    zoomRange,
  );

  const activeSeries: any[] = [];
  if (chartData) {
    Object.keys(rawResults)
      .sort()
      .forEach((key) => {
        activeSeries.push({
          name: key,
          color: getDynamicColor(key),
          unit: "V",
        });
      });
  }

  const typedChartData = chartData as
    | [(number | null)[], ...(number | null)[][]]
    | undefined;

  return (
    <ChartPanel
      title={panel.title}
      series={activeSeries}
      data={typedChartData as any}
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
      zoomRange={zoomRange}
    />
  );
}
