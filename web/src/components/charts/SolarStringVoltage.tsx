import { ChartPanel } from '../ChartPanel';
import { useChartData, useDynamicColor, useSyncedTimeframe } from '../../utils';
import type { ChartComponentProps } from '../../data';

export const SolarStringVoltageDefaults = {
    title: "Solar String Voltage",
    component: "SolarStringVoltage",
    size: 4,
    params: { timeframe: "24h" }
};

export function SolarStringVoltage({ panel, height, timeframe, onClick, showLegend, onTimeframeChange, onZoom }: ChartComponentProps) {
    const [localTf, setLocalTf] = useSyncedTimeframe(timeframe, panel.params?.timeframe);

    const handleTfChange = (val: string) => {
        setLocalTf(val);
        onTimeframeChange?.(val);
    };

    const getDynamicColor = useDynamicColor();
    const metrics = [{ name: 'solar_voltage_volts', label: 'String', all: true }];
    const { chartData, rawResults, loading } = useChartData(metrics, localTf);
    
    const series = Object.keys(rawResults).sort().map((name) => {
        return {
            name: name,
            color: getDynamicColor(name),
            unit: 'V'
        };
    });

    return <ChartPanel title={panel.title} series={series} data={chartData} onClick={onClick} timeframe={localTf} onTimeframeChange={handleTfChange} onZoom={onZoom} height={height} showLegend={showLegend} loading={loading} />;
}
