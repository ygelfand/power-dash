import { ChartPanel } from '../ChartPanel';
import { useChartData, useDynamicColor, useSyncedTimeframe } from '../../utils';
import type { ChartComponentProps } from '../../data';

export const GridHealthDefaults = {
    title: "Grid Health",
    component: "GridHealth",
    size: 6,
    params: { timeframe: "24h" }
};

export function GridHealth({ panel, height, timeframe, onClick, showLegend, onTimeframeChange, onZoom }: ChartComponentProps) {
    const [localTf, setLocalTf] = useSyncedTimeframe(timeframe, panel.params?.timeframe);
    const getDynamicColor = useDynamicColor();

    const handleTfChange = (val: string) => {
        setLocalTf(val);
        onTimeframeChange?.(val);
    };

    const metrics = [
        { name: 'grid_status_code', label: 'Status' },
        { name: 'frequency_hertz', label: 'Freq', tags: { site: 'site' } },
        { name: 'voltage_volts', label: 'Grid', tags: { site: 'site' }, all: true },
    ];
    const { chartData, rawResults, loading } = useChartData(metrics, localTf);

    const activeSeries: any[] = [];
    if (chartData) {
        // Status
        activeSeries.push({ name: 'Status', color: getDynamicColor('Status'), unit: '', stepped: true });
        // Freq
        activeSeries.push({ name: 'Frequency', color: getDynamicColor('Freq'), unit: 'Hz' });
        
        // Dynamic Grid Voltages
        Object.keys(rawResults).filter(k => k.startsWith('Grid')).sort().forEach(key => {
            activeSeries.push({ name: key, color: getDynamicColor(key), unit: 'V' });
        });
    }

    return <ChartPanel title={panel.title} series={activeSeries} data={chartData} onClick={onClick} timeframe={localTf} onTimeframeChange={handleTfChange} onZoom={onZoom} height={height} showLegend={showLegend} loading={loading} />;
}
