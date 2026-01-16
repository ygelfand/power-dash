import {
  Text,
  SimpleGrid,
  Group,
  ActionIcon,
  SegmentedControl,
  Badge,
} from "@mantine/core";
import { IconRotateClockwise2 } from "@tabler/icons-react";
import { useRef, useState, useEffect, useCallback } from "react";
import uPlot from "uplot";
import { BaseChart } from "./BaseChart";
import { Panel } from "./Panel";
import { parseTimeframe } from "../utils";
import classes from "./ChartPanel.module.css";

export interface SubChartConfig {
  title: string;
  data?: [number[], ...number[][]];
  seriesName?: string;
  color?: string;
  unit?: string;
}

interface MultiChartPanelProps {
  title: string;
  charts: SubChartConfig[];
  onClick?: (state: { timeframe: string; zoom?: [number, number] }) => void;
  onSelect?: (title: string) => void;
  cols?: number;
  timeframe: string;
  height?: number;
  tooltipFormat?: "date" | "datetime";
}

export function MultiChartPanel({
  title,
  charts,
  onClick,
  onSelect,
  cols = 2,
  timeframe: initialTimeframe,
  tooltipFormat,
  height,
}: MultiChartPanelProps) {
  const [localTf, setLocalTf] = useState(initialTimeframe);
  const rows = Math.ceil(charts.length / cols);
  const subHeight = height
    ? Math.max(150, Math.floor(height / rows) - 100)
    : 150;
  const [zoomedCharts, setZoomedCharts] = useState<Record<string, boolean>>({});
  const uplotRefs = useRef<Record<string, uPlot>>({});

  useEffect(() => {
    setLocalTf(initialTimeframe);
  }, [initialTimeframe]);

  const handleTfChange = useCallback((val: string) => {
    setLocalTf(val);
    setZoomedCharts({}); // Reset all zooms when timeframe changes
  }, []);

  const handleResetZoom = useCallback(
    (e: React.MouseEvent, chartTitle?: string) => {
      e.stopPropagation();
      if (chartTitle) {
        const u = uplotRefs.current[chartTitle];
        if (u) {
          const duration = parseTimeframe(localTf);
          const now = Math.floor(Date.now() / 1000);
          u.setScale("x", { min: now - duration, max: now });
          setZoomedCharts((prev) => ({ ...prev, [chartTitle]: false }));
        }
      } else {
        Object.values(uplotRefs.current).forEach((u) => {
          const duration = parseTimeframe(localTf);
          const now = Math.floor(Date.now() / 1000);
          u.setScale("x", { min: now - duration, max: now });
        });
        setZoomedCharts({});
      }
    },
    [localTf],
  );

  const isAnyZoomed = Object.values(zoomedCharts).some((v) => v);

  const handleExpand = () => {
    if (onClick) {
      let zoom: [number, number] | undefined;
      // Use the zoom from the first zoomed chart found
      const zoomedTitle = Object.keys(zoomedCharts).find(
        (k) => zoomedCharts[k],
      );
      if (zoomedTitle && uplotRefs.current[zoomedTitle]) {
        const { min, max } = uplotRefs.current[zoomedTitle].scales.x;
        if (min != null && max != null) {
          zoom = [min, max];
        }
      }
      onClick({ timeframe: localTf, zoom });
    }
  };

  return (
    <Panel
      title={title}
      onClick={handleExpand}
      rightSection={
        <Group gap="xs" wrap="nowrap" onClick={(e) => e.stopPropagation()}>
          {isAnyZoomed && (
            <Group gap={4} wrap="nowrap">
              <Badge size="xs" variant="light" color="blue">
                Zoomed
              </Badge>
              <ActionIcon
                variant="filled"
                color="blue"
                size="sm"
                onClick={(e) => handleResetZoom(e)}
                title="Reset Zoom"
                classNames={{ root: classes.actionIconZoomed }}
              >
                <IconRotateClockwise2 size={14} />
              </ActionIcon>
            </Group>
          )}
          <SegmentedControl
            size="xs"
            value={localTf}
            onChange={handleTfChange}
            classNames={{
              root: classes.segmentedControlRoot,
              indicator: classes.segmentedControlIndicator,
              label: classes.segmentedControlLabel,
              control: classes.segmentedControlControl,
            }}
            data={[
              { label: "1h", value: "1h" },
              { label: "1d", value: "24h" },
              { label: "1w", value: "7d" },
              { label: "1m", value: "30d" },
              { label: "1y", value: "1y" },
              { label: "all", value: "all" },
            ]}
          />
        </Group>
      }
    >
      <SimpleGrid cols={cols} spacing="xs">
        {charts.map((chart) => (
          <div
            key={chart.title}
            className={`${classes.subPanel} ${onSelect ? classes.interactive : ""}`}
            onClick={(e) => {
              if (onSelect) {
                e.stopPropagation();
                onSelect(chart.title);
              }
            }}
          >
            <Group justify="space-between" mb={4}>
              <Text size="xs" c="dimmed">
                {chart.title}
              </Text>
              {zoomedCharts[chart.title] && (
                <Group gap={4} wrap="nowrap">
                  <Badge size="xs" variant="light" color="blue">
                    Zoomed
                  </Badge>
                  <ActionIcon
                    variant="filled"
                    color="blue"
                    size="xs"
                    onClick={(e) => handleResetZoom(e, chart.title)}
                    title="Reset Zoom"
                    classNames={{ root: classes.actionIconZoomed }}
                  >
                    <IconRotateClockwise2 size={12} />
                  </ActionIcon>
                </Group>
              )}
            </Group>
            <div className={classes.flexGrow}>
              <BaseChart
                data={chart.data}
                series={[
                  {
                    name: chart.seriesName || "Value",
                    color: chart.color || "#4dabf7",
                    unit: chart.unit,
                  },
                ]}
                height={subHeight}
                timeframe={localTf}
                tooltipFormat={tooltipFormat}
                onCreate={(u) => (uplotRefs.current[chart.title] = u)}
                onZoom={(isZoomed) =>
                  setZoomedCharts((prev) => ({
                    ...prev,
                    [chart.title]: isZoomed,
                  }))
                }
                isZoomed={zoomedCharts[chart.title]}
              />
            </div>
          </div>
        ))}
      </SimpleGrid>
    </Panel>
  );
}
