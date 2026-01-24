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
  const { chartData, seriesKeys, loading } = useChartData(
    metrics,
    localTf,
    undefined,
    undefined,
    undefined,
    zoomRange
  );

  const activeSeries: any[] = [];
  // Start with timestamps
  const finalChartData: [(number | null)[], ...(number | null)[][]] = [
    (chartData && chartData[0]) ? (chartData[0] as (number | null)[]) : []
  ];

  if (chartData && seriesKeys) {
    seriesKeys.forEach((key, index) => {
      // chartData[0] is timestamps, so series data is at index + 1
      const colData = chartData[index + 1];
      if (!colData) return;

      const hasData = colData.some((v) => v !== 0 && v !== null);

      if (hasData) {
        let name = key;
        if (key.startsWith("Site")) {
          if (key.includes("site=load")) name = "Load";
          else if (key.includes("site=site")) name = "Grid";
        } else if (key.startsWith("Inverter")) {
          const match = key.match(/index=(\d+)/);
          if (match) name = `Inverter ${match[1]}`;
        }

        activeSeries.push({
          name: name,
          color: getDynamicColor(name),
          unit: "Hz",
        });
        finalChartData.push(colData as (number | null)[]);
      }
    });
  }

  return (
    <ChartPanel
      title={panel.title}
      series={activeSeries}
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
      autoScale={true}
      spanGaps={true}
      zoomRange={zoomRange}
    />
  );
}
