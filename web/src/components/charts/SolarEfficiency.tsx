import { ChartPanel } from '../ChartPanel';
import { useChartData, useDynamicColor, useSyncedTimeframe } from '../../utils';
import type { ChartComponentProps } from '../../data';
import { Center, Loader } from "@mantine/core";

export const SolarEfficiencyDefaults = {
    title: "Solar Efficiency",
    component: "SolarEfficiency",
    size: 6,
    params: { timeframe: "24h" }
};

export function SolarEfficiency({ panel, height, timeframe, onClick, showLegend, onTimeframeChange }: ChartComponentProps) {
    const [localTf, setLocalTf] = useSyncedTimeframe(timeframe, panel.params?.timeframe);

    const handleTfChange = (val: string) => {
        setLocalTf(val);
        onTimeframeChange?.(val);
    };

    const getDynamicColor = useDynamicColor();
    const metrics = [
        { name: 'solar_voltage_volts', label: 'Voltage', all: true },
        { name: 'solar_current_amps', label: 'Current', all: true },
    ];
    const { chartData, rawResults, loading } = useChartData(metrics, localTf);

    if (loading) return <Center h={height}><Loader size="sm" /></Center>;

    const series = Object.keys(rawResults).sort().map((name) => {
        const isVoltage = name.includes('Voltage');
        return {
            name: name,
            color: getDynamicColor(name),
            unit: isVoltage ? 'V' : 'A',
        };
    });

    return <ChartPanel title={panel.title} series={series} data={chartData} onClick={onClick} timeframe={localTf} onTimeframeChange={handleTfChange} height={height} showLegend={showLegend} />;
}
