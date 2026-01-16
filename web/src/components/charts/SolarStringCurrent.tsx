import { useState } from 'react';
import { ChartPanel } from '../ChartPanel';
import { useChartData, useDynamicColor, useSyncedTimeframe } from '../../utils';
import type { ChartComponentProps } from '../../data';

export const SolarStringCurrentDefaults = {
    title: "Solar String Current",
    component: "SolarStringCurrent",
    size: 4,
    params: { timeframe: "24h" }
};

export function SolarStringCurrent({ panel, height, timeframe, onClick, showLegend, onTimeframeChange, onZoom }: ChartComponentProps) {
    const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
    const [localTf, setLocalTf] = useSyncedTimeframe(timeframe, panel.params?.timeframe);

    const handleTfChange = (val: string) => {
        setLocalTf(val);
        setZoomRange(null);
        onTimeframeChange?.(val);
    };

    const getDynamicColor = useDynamicColor();
    const metrics = [{ name: 'solar_current_amps', label: 'String', all: true }];
    const { chartData, rawResults, loading } = useChartData(
        metrics, 
        localTf, 
        undefined, 
        undefined, 
        undefined, 
        zoomRange
    );

    const series = Object.keys(rawResults).sort().map((name) => {
        return {
            name: name,
            color: getDynamicColor(name),
            unit: 'A'
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
