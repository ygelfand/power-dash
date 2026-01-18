import { useState, useEffect, useMemo } from "react";
import {
  SimpleGrid,
  Text,
  Center,
  Loader,
  Group,
  Badge,
  ActionIcon,
} from "@mantine/core";
import { IconRotateClockwise2 } from "@tabler/icons-react";
import { Panel } from "../Panel";
import { BaseChart } from "../BaseChart";
import { batchQueryMetrics } from "../../data";
import type { DataPoint, ChartComponentProps } from "../../data";
import { bars } from "./uplot-utils";
import classes from "../ChartPanel.module.css";

export const MonthlyAnalyticsDefaults = {
  title: "Monthly Analytics",
  component: "MonthlyAnalytics",
  size: 12,
  params: {
    load: "Home",
    solar: "Solar",
    battery: "Battery",
    site: "Grid",
  },
};

export function MonthlyAnalytics({
  panel,
  height,
  onSelect,
  onZoom,
  onClick,
}: ChartComponentProps) {
  const [data, setData] = useState<Record<string, DataPoint[]>>({});
  const [loading, setLoading] = useState(true);
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
  const barPaths = useMemo(() => bars(), []);

  const selectedMetric = panel.params?.selectedMetric;

  useEffect(() => {
    const fetchData = async () => {
      let start: number, end: number;
      let queryStep = 86400;

      if (zoomRange) {
        [start, end] = zoomRange;
        const duration = end - start;
        // If zoomed into less than 7 days, get hourly data
        if (duration < 86400 * 7) {
          queryStep = 3600;
        }
      } else {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        end = Math.floor(now.getTime() / 1000) + 86400; // Midnight tonight
        start = end - 86400 * 30; // 30 days ago
      }

      const metrics = [
        {
          name: "power_watts",
          label: "Home",
          tags: { site: "load" },
        },
        {
          name: "power_watts",
          label: "Solar",
          tags: { site: "solar" },
        },
        {
          name: "power_watts",
          label: "Battery",
          tags: { site: "battery" },
        },
        {
          name: "power_watts",
          label: "From Grid",
          tags: { site: "site_import" },
        },
        {
          name: "power_watts",
          label: "To Grid",
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
        setData(results);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [zoomRange]);

  if (loading)
    return (
      <Center h={height}>
        <Loader size="sm" />
      </Center>
    );

  let metricsList = [
    { label: "Home", color: "#228be6", paramKey: "load" },
    { label: "Solar", color: "#fab005", paramKey: "solar" },
    { label: "Battery", color: "#40c057", paramKey: "battery" },
    { label: "Grid", color: "#fa5252", paramKey: "site" },
  ];

  if (selectedMetric) {
    metricsList = metricsList.filter((m) => m.label === selectedMetric);
  }

  const cols = metricsList.length > 2 ? 2 : 1;

  const handleResetZoom = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoomRange(null);
    onZoom?.(false);
  };

  const handleZoom = (isZ: boolean, range?: [number, number]) => {
    setZoomRange(isZ && range ? range : null);
    onZoom?.(isZ);
  };

  return (
    <Panel
      onClick={() =>
        onClick?.({ timeframe: "30d", zoom: zoomRange || undefined })
      }
      title={panel.title}
      rightSection={
        zoomRange && (
          <Group gap={4} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
            <Badge size="xs" variant="light" color="blue">
              Zoomed
            </Badge>
            <ActionIcon
              variant="filled"
              color="blue"
              size="sm"
              onClick={handleResetZoom}
              title="Reset Zoom"
              classNames={{ root: classes.actionIconZoomed }}
            >
              <IconRotateClockwise2 size={14} />
            </ActionIcon>
          </Group>
        )
      }
    >
      <SimpleGrid cols={cols} spacing="xs">
        {metricsList.map((m, index) => {
          let chartData: [number[], ...number[][]];
          let series: any[] = [];
          const label = panel.params?.[m.paramKey] || m.label;

          if (m.label === "Grid") {
            const fromGrid = data["From Grid"] || [];
            const toGrid = data["To Grid"] || [];

            // Align timestamps from both series
            const timestamps = new Set<number>();
            fromGrid.forEach((p) => timestamps.add(p.Timestamp));
            toGrid.forEach((p) => timestamps.add(p.Timestamp));
            const sortedTs = Array.from(timestamps).sort((a, b) => a - b);

            const fromMap = new Map(
              fromGrid.map((p) => [p.Timestamp, p.Value]),
            );
            const toMap = new Map(toGrid.map((p) => [p.Timestamp, p.Value]));

            chartData = [
              sortedTs,
              sortedTs.map((ts) => fromMap.get(ts) ?? 0),
              sortedTs.map((ts) => -(toMap.get(ts) ?? 0)), // Invert export
            ];

            series = [
              {
                name: "From Grid",
                color: "#fa5252",
                paths: barPaths,
                unit: "Wh",
              },
              {
                name: "To Grid",
                color: "#be4bdb",
                paths: barPaths,
                unit: "Wh",
              },
            ];
          } else {
            const pts = data[m.label] || [];
            chartData = [pts.map((p) => p.Timestamp), pts.map((p) => p.Value)];
            series = [
              { name: label, color: m.color, paths: barPaths, unit: "Wh" },
            ];
          }

          return (
            <div
              key={index}
              className={`${classes.subPanel} ${onSelect ? classes.interactive : ""}`}
              onClick={() => {
                if (onSelect) {
                  onSelect(m.label);
                }
              }}
            >
              <Text
                size="xs"
                fw={700}
                mb={4}
                ta="center"
                tt="uppercase"
                c="dimmed"
              >
                {label}
              </Text>
              <div style={{ flexGrow: 1, minHeight: 150 }}>
                <BaseChart
                  data={chartData}
                  series={series}
                  height={selectedMetric ? height : 150}
                  timeframe="30d"
                  tooltipFormat="date"
                  onZoom={handleZoom}
                  zoomRange={zoomRange}
                  isZoomed={!!zoomRange}
                  onClick={() => onSelect?.(m.label)}
                />
              </div>
            </div>
          );
        })}
      </SimpleGrid>
    </Panel>
  );
}
