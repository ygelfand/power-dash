import { useState } from 'react';
import { ChartPanel } from '../ChartPanel';
import { useChartData, useDynamicColor, useSyncedTimeframe } from '../../utils';
import type { ChartComponentProps } from '../../data';

export const ReactivePowerDefaults = {
    title: "Reactive Power",
    component: "ReactivePower",
    size: 6,
    params: { timeframe: "24h" }
};

export function ReactivePower({ panel, height, timeframe, onClick, showLegend, onTimeframeChange, onZoom }: ChartComponentProps) {
    const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
    const [localTf, setLocalTf] = useSyncedTimeframe(timeframe, panel.params?.timeframe);

    const handleTfChange = (val: string) => {
        setLocalTf(val);
        setZoomRange(null);
        onTimeframeChange?.(val);
    };

    const getDynamicColor = useDynamicColor();
    const metrics = [
        { name: 'power_reactive_var', label: 'Grid', tags: { site: 'site' } },
        { name: 'power_reactive_var', label: 'Home', tags: { site: 'load' } },
        { name: 'power_reactive_var', label: 'Solar', tags: { site: 'solar' } },
        { name: 'power_reactive_var', label: 'Battery', tags: { site: 'battery' } },
    ];
    const { chartData, loading } = useChartData(
        metrics, 
        localTf, 
        undefined, 
        undefined, 
        undefined, 
        zoomRange
    );

    const series = [
        { name: 'Grid', color: getDynamicColor('Grid'), unit: 'VAR' },
        { name: 'Home', color: getDynamicColor('Home'), unit: 'VAR' },
        { name: 'Solar', color: getDynamicColor('Solar'), unit: 'VAR' },
        { name: 'Battery', color: getDynamicColor('Battery'), unit: 'VAR' },
    ];

    return <ChartPanel 
        title={panel.title} 
        series={series} 
        data={chartData} 
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
    />;
}
