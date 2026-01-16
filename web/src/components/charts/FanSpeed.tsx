import { useState } from 'react';
import { ChartPanel } from '../ChartPanel';
import { useChartData, useDynamicColor, useSyncedTimeframe } from '../../utils';
import type { ChartComponentProps } from '../../data';

export const FanSpeedDefaults = {
    title: "Fan Speed",
    component: "FanSpeed",
    size: 4,
    params: { timeframe: "24h" }
};

export function FanSpeed({ panel, height, timeframe, onClick, showLegend, onTimeframeChange, onZoom }: ChartComponentProps) {
    const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
    const [localTf, setLocalTf] = useSyncedTimeframe(timeframe, panel.params?.timeframe);

    const handleTfChange = (val: string) => {
        setLocalTf(val);
        setZoomRange(null);
        onTimeframeChange?.(val);
    };

    const getDynamicColor = useDynamicColor();
    const metrics = [
        { name: 'fan_speed_rpm', label: 'Actual', tags: { source: 'actual' }, all: true },
        { name: 'fan_speed_rpm', label: 'Target', tags: { source: 'target' }, all: true }
    ];
    const { chartData, rawResults, loading } = useChartData(metrics, localTf, undefined, undefined, undefined, zoomRange);

    const series = Object.keys(rawResults).sort().map((name) => {
        const isTarget = name.startsWith('Target');
        return {
            name: name,
            color: getDynamicColor(name),
            unit: 'RPM',
            fill: isTarget ? 'none' : undefined,
            stepped: true
        };
    });

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