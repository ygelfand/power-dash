import {
  ActionIcon,
  Group,
  SegmentedControl,
  Badge,
  LoadingOverlay,
  Text,
} from "@mantine/core";
import {
  IconRotateClockwise2,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import { useRef, useState, useEffect } from "react";
import uPlot from "uplot";
import { BaseChart } from "./BaseChart";
import { Panel } from "./Panel";
import { parseTimeframe } from "../utils";
import classes from "./ChartPanel.module.css";

interface ChartPanelSeries {
  name: string;
  color: string;
  unit?: string;
}

interface ChartPanelProps {
  title: string;
  data?: [number[], ...number[][]];
  onClick?: (state: { timeframe: string; zoom?: [number, number] }) => void;
  series: ChartPanelSeries[];
  timeframe: string;
  height?: number;
  tooltipFormat?: "date" | "datetime";
  convertFunc?: (val: number) => number;
  onTimeframeChange?: (tf: string) => void;
  onZoom?: (isZoomed: boolean, range?: [number, number]) => void;
  fixedTimeframe?: boolean;
  showLegend?: boolean;
  loading?: boolean;
  zoomRange?: [number, number] | null;
  autoScale?: boolean;
  spanGaps?: boolean;
}

export function ChartPanel({
  title,
  onClick,
  data,
  series,
  timeframe: initialTimeframe,
  height,
  tooltipFormat,
  convertFunc,
  onTimeframeChange,
  onZoom,
  fixedTimeframe = false,
  showLegend = false,
  loading = false,
  zoomRange,
  autoScale = false,
  spanGaps,
}: ChartPanelProps) {
  const [isZoomed, setIsZoomed] = useState(false);
  const [currentTimeframe, setCurrentTimeframe] = useState(initialTimeframe);
  const uplotRef = useRef<uPlot | null>(null);

  // Sync with prop updates
  useEffect(() => {
    setCurrentTimeframe(initialTimeframe);
    // Reset zoom when global timeframe changes
    setIsZoomed(false);
  }, [initialTimeframe]);

  const handleResetZoom = (e: React.MouseEvent) => {
    e.stopPropagation();

    setIsZoomed(false);

    onZoom?.(false, null as any);

    if (uplotRef.current) {
      const duration = parseTimeframe(currentTimeframe);

      const now = Math.floor(Date.now() / 1000);

      uplotRef.current.setScale("x", { min: now - duration, max: now });
    }
  };

  const handleTfChange = (val: string) => {
    setCurrentTimeframe(val);

    setIsZoomed(false); // Reset zoom when timeframe changes

    onTimeframeChange?.(val);
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();

    const duration = parseTimeframe(currentTimeframe);

    let start, end;

    if (zoomRange) {
      [start, end] = zoomRange;
    } else {
      end = Math.floor(Date.now() / 1000);

      start = end - duration;
    }

    const newRange: [number, number] = [start - duration, end - duration];

    onZoom?.(true, newRange);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!zoomRange) return;

    const duration = parseTimeframe(currentTimeframe);

    const [start, end] = zoomRange;

    const newRange: [number, number] = [start + duration, end + duration];

    const now = Math.floor(Date.now() / 1000);

    if (newRange[1] >= now) {
      setIsZoomed(false);

      onZoom?.(false, null as any);
    } else {
      onZoom?.(true, newRange);
    }
  };

  const handleExpand = () => {
    if (onClick) {
      let zoom: [number, number] | undefined;

      if (isZoomed && uplotRef.current) {
        const { min, max } = uplotRef.current.scales.x;

        if (min != null && max != null) {
          zoom = [min, max];
        }
      }

      onClick({ timeframe: currentTimeframe, zoom });
    }
  };

  // Heuristic: if zoomed and the duration is not exactly the timeframe duration, it's a manual zoom

  const duration = parseTimeframe(currentTimeframe);

  const isManualZoom =
    isZoomed &&
    zoomRange &&
    Math.abs(zoomRange[1] - zoomRange[0] - duration) > 10;

  const isNavigating = zoomRange && !isManualZoom;

  const canGoForward = !!zoomRange;

  // Calculate "Page" offset

  let pageOffset = 0;
  if (isNavigating && zoomRange) {
    const now = Math.floor(Date.now() / 1000);

    pageOffset = Math.round((now - zoomRange[1]) / duration);
  }

  return (
    <Panel
      title={title}
      onClick={handleExpand}
      rightSection={
        <Group gap="xs" wrap="nowrap" onClick={(e) => e.stopPropagation()}>
          {isManualZoom ? (
            <Group gap={4} wrap="nowrap">
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
          ) : (
            <Group gap={0} wrap="nowrap" className={classes.navGroup}>
              <ActionIcon
                variant="default"
                size="sm"
                onClick={handlePrev}
                title="Previous"
                className={classes.navButtonLeft}
              >
                <IconChevronLeft size={14} />
              </ActionIcon>

              <div className={classes.navPageIndicator}>
                <Text
                  className={`${classes.navPageText} ${
                    pageOffset > 0 ? classes.navPageActive : classes.navPageLive
                  }`}
                >
                  {pageOffset > 0 ? `-${pageOffset}` : "LIVE"}
                </Text>
              </div>
              <ActionIcon
                variant="default"
                size="sm"
                onClick={handleNext}
                disabled={!canGoForward}
                title="Next"
                className={classes.navButtonRight}
              >
                <IconChevronRight size={14} />
              </ActionIcon>
            </Group>
          )}

          {!fixedTimeframe && (
            <SegmentedControl
              size="xs"
              value={currentTimeframe}
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
                { label: "All", value: "all" },
              ]}
            />
          )}
        </Group>
      }
    >
      <div style={{ position: "relative", height: "100%" }}>
        {loading ? (
          <LoadingOverlay
            visible={loading}
            zIndex={1000}
            overlayProps={{ radius: "sm", blur: 2 }}
          />
        ) : (
          <BaseChart
            data={data}
            series={series}
            timeframe={currentTimeframe}
            height={height}
            tooltipFormat={tooltipFormat}
            convertFunc={convertFunc}
            onCreate={(u) => (uplotRef.current = u)}
            onZoom={(z, range) => {
              setIsZoomed(z);
              onZoom?.(z, range);
            }}
            isZoomed={isZoomed}
            showLegend={showLegend}
            zoomRange={zoomRange}
            autoScale={autoScale}
            spanGaps={spanGaps}
          />
        )}
      </div>
    </Panel>
  );
}
