import { useState, useEffect } from "react";
import { ChartPanel } from "../ChartPanel";
import { batchQueryMetrics } from "../../data";
import type { ChartComponentProps } from "../../data";
import { Center, Loader } from "@mantine/core";

export const YearlyAnalyticsDefaults = {
  title: "Yearly Solar Production",
  component: "YearlyAnalytics",
  size: 12,
};

export function YearlyAnalytics({
  panel,
  height,
  onClick,
  onZoom,
}: ChartComponentProps) {
  const [loading, setLoading] = useState(true);
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
  const [chartData, setChartData] = useState<
    [number[], ...number[][]] | undefined
  >();

  const activeTf = "1y"; // Locked to 1 year

  useEffect(() => {
    const fetchData = async () => {
      let start: number, end: number;
      const queryStep = 86400;

      if (zoomRange) {
        [start, end] = zoomRange;
        start = Math.floor(start / 86400) * 86400;
        end = Math.ceil(end / 86400) * 86400;
      } else {
        // Align to UTC midnight to match backend's floor(ts/86400)*86400 logic
        end = Math.floor(Date.now() / 1000 / 86400) * 86400 + 86400;
        start = end - 86400 * 365;
      }

      const metrics = [
        { name: "power_watts", label: "Solar", tags: { site: "solar" } },
        { name: "power_watts", label: "Home", tags: { site: "load" } },
        {
          name: "power_watts",
          label: "Grid From",
          tags: { site: "site_import" },
        },
        {
          name: "power_watts",
          label: "Grid To",
          tags: { site: "site_export" },
        },
      ];

      try {
        const results = await batchQueryMetrics(
          metrics,
          Math.floor(start),
          Math.ceil(end),
          queryStep,
          "integral",
        );

        Object.keys(results).forEach((key) => {
          results[key] = results[key].map((p) => ({
            ...p,
            Value: p.Value / 3600,
          }));
        });

        const finalTs = [];
        for (let t = Math.floor(start); t < end; t += 86400) {
          finalTs.push(t);
        }

        const solarMap = new Map(
          (results["Solar"] || []).map((p) => [p.Timestamp, p.Value]),
        );
        const homeMap = new Map(
          (results["Home"] || []).map((p) => [p.Timestamp, p.Value]),
        );
        const gridFromMap = new Map(
          (results["Grid From"] || []).map((p) => [p.Timestamp, p.Value]),
        );
        const gridToMap = new Map(
          (results["Grid To"] || []).map((p) => [p.Timestamp, p.Value]),
        );

        const gridData = finalTs.map((ts) => {
          const from = gridFromMap.get(ts);
          const to = gridToMap.get(ts);
          if (from === undefined && to === undefined) return null;
          return (from ?? 0) - (to ?? 0);
        });
        setChartData([
          finalTs,
          finalTs.map((ts) => solarMap.get(ts) ?? null),
          finalTs.map((ts) => homeMap.get(ts) ?? null),
          gridData,
        ] as [number[], ...number[][]] | undefined);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [zoomRange]);

  if (loading)
    return (
      <Center h={height}>
        <Loader size="sm" />
      </Center>
    );

  const series = [
    { name: "Solar", color: "#fab005", unit: "Wh", stepped: true }, // Default filled
    { name: "Home", color: "#228be6", unit: "Wh", fill: "none", stepped: true },
    { name: "Grid", color: "#be4bdb", unit: "Wh", fill: "none", stepped: true },
  ];

  return (
    <ChartPanel
      title={panel.title}
      series={series}
      data={chartData}
      onClick={() =>
        onClick?.({ timeframe: activeTf, zoom: zoomRange || undefined })
      }
      timeframe={activeTf}
      height={height}
      tooltipFormat="date"
      fixedTimeframe={true}
      onZoom={(z, range) => {
        setZoomRange(z && range ? range : null);
        onZoom?.(z);
      }}
      zoomRange={zoomRange}
      spanGaps={false}
    />
  );
}
