import { ChartPanel } from '../ChartPanel';
import { useChartData, useDynamicColor, useSyncedTimeframe } from '../../utils';
import type { ChartComponentProps } from '../../data';

export const SolarStringPowerDefaults = {
    title: "Solar String Power",
    component: "SolarStringPower",
    size: 4,
    params: { timeframe: "24h" }
};

export function SolarStringPower({ panel, height, timeframe, onClick, showLegend, onTimeframeChange, onZoom }: ChartComponentProps) {
    const [localTf, setLocalTf] = useSyncedTimeframe(timeframe, panel.params?.timeframe);

    const handleTfChange = (val: string) => {
        setLocalTf(val);
        onTimeframeChange?.(val);
    };

    const getDynamicColor = useDynamicColor();
    const metrics = [{ name: 'solar_power_watts', label: 'String', all: true }];
    const { chartData, rawResults, loading } = useChartData(metrics, localTf);

    const series = Object.keys(rawResults).sort().map((name) => {
        return {
            name: name,
            color: getDynamicColor(name),
            unit: 'W'
        };
    });

    return <ChartPanel title={panel.title} series={series} data={chartData} onClick={onClick} timeframe={localTf} onTimeframeChange={handleTfChange} onZoom={onZoom} height={height} showLegend={showLegend} loading={loading} />;
}
