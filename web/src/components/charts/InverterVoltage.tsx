import { useState } from "react";
import { ChartPanel } from "../ChartPanel";
import { useChartData, useSyncedTimeframe, useDynamicColor } from "../../utils";
import type { ChartComponentProps } from "../../data";

export const InverterVoltageDefaults = {
  title: "Inverter Voltage",
  component: "InverterVoltage",
  size: 6,
  params: { timeframe: "24h" },
};

export function InverterVoltage({
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
  const getDynamicColor = useDynamicColor();

  const handleTfChange = (val: string) => {
    setLocalTf(val);
    setZoomRange(null);
    onTimeframeChange?.(val);
  };

  const metrics = [
    { name: "inverter_voltage_volts", label: "Inverter", all: true },
  ];
  const { chartData, seriesKeys, loading } = useChartData(
    metrics,
    localTf,
    undefined,
    undefined,
    undefined,
    zoomRange,
    false
  );

  const finalSeries: any[] = [];
  const finalChartData: any[] = [(chartData && chartData[0]) || []];

  if (chartData && seriesKeys) {
    seriesKeys.forEach((key, i) => {
      const col = chartData[i + 1];
      if (col && col.some((v) => v !== 0 && v !== null)) {
        finalSeries.push({
          name: key,
          color: getDynamicColor(key),
          unit: "V",
        });
        finalChartData.push(col);
      }
    });
  }

  return (
    <ChartPanel
      title={panel.title}
      series={finalSeries}
      data={finalChartData as any}
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
