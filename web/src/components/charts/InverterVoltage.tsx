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
    { name: "inverter_voltage_volts", label: "Inverter", all: true },
  ];
  const { chartData, rawResults, loading } = useChartData(metrics, localTf);

  const sortedKeys = Object.keys(rawResults)
    .sort()
    .filter((key) => rawResults[key].some((p) => p.Value !== 0));
  
  const finalSeries = sortedKeys.map((key) => ({
      name: key,
      color: getDynamicColor(key),
      unit: "V",
  }));

  return (
    <ChartPanel
      title={panel.title}
      series={finalSeries}
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
