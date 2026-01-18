import type { PanelConfig } from "../data";
import { ComponentRegistry } from "./charts/Registry";
import { ErrorBoundary } from "./ErrorBoundary";

export function DynamicPanel({
  panel,
  timeframe,
  height = 300,
  onSelect,
  onClick,
  onCreate,
  onZoom,
  onTimeframeChange,
  showLegend: explicitShowLegend,
}: {
  panel: PanelConfig;
  timeframe: string;
  height?: number;
  onSelect?: (metricLabel?: string) => void;
  onClick?: (state: { timeframe: string; zoom?: [number, number] }) => void;
  onCreate?: (u: uPlot) => void;
  onZoom?: (isZoomed: boolean) => void;
  onTimeframeChange?: (tf: string) => void;
  showLegend?: boolean;
}) {
  const Chart =
    ComponentRegistry[panel.component] || ComponentRegistry["PowerFlow"];
  const showLegend =
    explicitShowLegend !== undefined ? explicitShowLegend : panel.showLegend;

  return (
    <div style={{ minHeight: height }}>
      <ErrorBoundary>
        <Chart
          panel={panel}
          height={height}
          onSelect={onSelect}
          onClick={onClick}
          timeframe={timeframe}
          onCreate={onCreate}
          onZoom={onZoom}
          onTimeframeChange={onTimeframeChange}
          showLegend={showLegend}
        />
      </ErrorBoundary>
    </div>
  );
}

