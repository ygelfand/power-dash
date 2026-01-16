import { PanelDefaults } from "./components/charts/Registry";

export interface DashboardConfig {
  name: string;
  timeframe: string;
  panels: PanelConfig[];
}

// Internal application type with required fields
export interface PanelConfig {
  name: string;
  title: string;
  component: string;
  size: number;
  params?: Record<string, any>;
  showLegend?: boolean;
}

// API response type with optional fields
export interface RawPanelConfig {
  name: string;
  title?: string;
  component?: string;
  size?: number;
  params?: Record<string, any>;
  showLegend?: boolean;
}

export interface DataPoint {
  Value: number;
  Timestamp: number;
}

export interface MetricQuery {
  name: string;
  label: string;
  tags?: Record<string, string>;
  all?: boolean;
}

export interface ChartComponentProps {
  panel: PanelConfig;
  height?: number;
  timeframe: string;
  onClick?: (state: { timeframe: string; zoom?: [number, number] }) => void;
  onSelect?: (label?: string) => void;
  onTimeframeChange?: (tf: string) => void;
  onZoom?: (isZoomed: boolean) => void;
  showLegend?: boolean;
}

let cachedDashboards: Promise<DashboardConfig[]> | null = null;

export async function fetchDashboards(): Promise<DashboardConfig[]> {
  if (cachedDashboards) return cachedDashboards;

  cachedDashboards = (async () => {
    const resp = await fetch("/api/v1/dashboards");
    if (!resp.ok) {
      cachedDashboards = null; // Clear on error to allow retry
      throw new Error("Failed to fetch dashboards");
    }
    const rawDashboards: any[] = await resp.json();

    return rawDashboards.map((db) => ({
      ...db,
      panels: (db.panels || []).map((p: RawPanelConfig) => {
        const def = PanelDefaults[p.name] || {};
        return {
          ...def,
          ...p,
          title: p.title || (def.title as string) || p.name,
          component: p.component || (def.component as string),
          size: p.size || (def.size as number) || 12,
          showLegend:
            p.showLegend !== undefined
              ? p.showLegend
              : (def.showLegend as boolean),
          params: { ...(def.params || {}), ...(p.params || {}) },
        } as PanelConfig;
      }),
    }));
  })();

  return cachedDashboards;
}

export async function batchQueryMetrics(
  metrics: MetricQuery[],
  start: number,
  end: number,
  step?: number,
  func?: string,
): Promise<Record<string, DataPoint[]>> {
  const resp = await fetch("/api/v1/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      metrics: metrics.map((m) => ({
        name: m.name,
        label: m.label,
        tags: m.tags,
        all: m.all,
      })),
      start,
      end,
      step,
      function: func,
    }),
  });
  if (!resp.ok) throw new Error("Failed to query metrics");
  const rawData = await resp.json();
  const results: Record<string, DataPoint[]> = {};
  Object.keys(rawData).forEach((key) => {
    results[key] = (rawData[key] || []).map((p: any) => ({
      Value: p.v,
      Timestamp: p.t,
    }));
  });
  return results;
}

export async function queryLatestMetrics(
  metrics: MetricQuery[]
): Promise<Record<string, DataPoint>> {
  const resp = await fetch("/api/v1/latest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      metrics: metrics.map((m) => ({
        name: m.name,
        label: m.label,
        tags: m.tags,
      })),
    }),
  });
  if (!resp.ok) throw new Error("Failed to query latest metrics");
  const rawData = await resp.json();
  const results: Record<string, DataPoint> = {};
  Object.keys(rawData).forEach((key) => {
    if (rawData[key]) {
      results[key] = {
        Value: rawData[key].v,
        Timestamp: rawData[key].t,
      };
    }
  });
  return results;
}
