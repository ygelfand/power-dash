import { useMemo, useState } from "react";
import { Panel } from "../Panel";
import {
  useRawMetrics,
  useDynamicColor,
  parseTimeframe,
  getContrastingTextColor,
  useSyncedTimeframe,
  useDataRefresh,
} from "../../utils";
import type { ChartComponentProps, DataPoint } from "../../data";
import {
  Center,
  Text,
  ScrollArea,
  Tooltip,
  SegmentedControl,
  Group,
  Box,
  LoadingOverlay,
} from "@mantine/core";
import classes from "../ChartPanel.module.css";
import chartClasses from "./Charts.module.scss";

export const SystemAlertsDefaults = {
  title: "System Alerts",
  component: "SystemAlerts",
  size: 12,
  params: { timeframe: "24h" },
};

export function SystemAlerts({
  panel,
  height = 300,
  timeframe,
  onClick,
  onTimeframeChange,
}: ChartComponentProps) {
  const [localTf, setLocalTf] = useSyncedTimeframe(
    timeframe,
    panel.params?.timeframe,
  );

  const handleTfChange = (val: string) => {
    setLocalTf(val);
    onTimeframeChange?.(val);
  };

  const getDynamicColor = useDynamicColor();
  const metrics = [{ name: "active_alert", label: "Alert", all: true }];
  const { rawResults, loading } = useRawMetrics(metrics, localTf);

  // eslint-disable-next-line react-hooks/purity
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  useDataRefresh(() => {
    setNow(Math.floor(Date.now() / 1000));
  }, 30000);

  const { duration, start } = useMemo(() => {
    const d = parseTimeframe(localTf);
    return { duration: d, start: now - d };
  }, [localTf, now]);

  const controls = (
    <Group gap="xs" wrap="nowrap" onClick={(e) => e.stopPropagation()}>
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
          { label: "All", value: "all" },
        ]}
      />
    </Group>
  );

  // If no alerts found and not loading
  if (!loading && (!rawResults || Object.keys(rawResults).length === 0)) {
    return (
      <Panel
        title={panel.title}
        onClick={() => onClick?.({ timeframe: localTf })}
        rightSection={controls}
      >
        <Center h={height}>
          <Text c="dimmed">No active alerts in this timeframe</Text>
        </Center>
      </Panel>
    );
  }

  // 1. Group raw results by CLEAN alert name
  const groupedAlerts: Record<
    string,
    { intervals: { start: number; end: number }[] }
  > = {};

  if (rawResults) {
    Object.keys(rawResults).forEach((name) => {
      // Clean name logic: Use the 'name=' part of the label string or fallback to full key
      const match = name.match(/Alert\s+([^,\]\s]+)/);
      const cleanName = match ? match[1] : name;

      if (!groupedAlerts[cleanName]) {
        groupedAlerts[cleanName] = { intervals: [] };
      }

      // Process points into intervals for this specific raw series
      const points = rawResults[name];
      let currentStart: number | null = null;
      let lastTs = 0;

      points.forEach((p: DataPoint) => {
        if (currentStart !== null && p.Timestamp - lastTs > 300) {
          groupedAlerts[cleanName].intervals.push({
            start: currentStart,
            end: lastTs,
          });
          currentStart = null;
        }
        if (p.Value > 0) {
          if (currentStart === null) currentStart = p.Timestamp;
          lastTs = p.Timestamp;
        } else {
          if (currentStart !== null) {
            groupedAlerts[cleanName].intervals.push({
              start: currentStart,
              end: p.Timestamp,
            });
            currentStart = null;
          }
        }
      });
      if (currentStart !== null) {
        groupedAlerts[cleanName].intervals.push({
          start: currentStart,
          end: lastTs,
        });
      }
    });
  }

  // 2. Flatten and merge intervals for each alert type
  const rows = Object.keys(groupedAlerts)
    .sort()
    .map((alertName) => {
      const rawIntervals = groupedAlerts[alertName].intervals.sort(
        (a, b) => a.start - b.start,
      );
      const mergedIntervals: {
        start: number;
        end: number;
      }[] = [];

      if (rawIntervals.length > 0) {
        let current = rawIntervals[0];

        for (let i = 1; i < rawIntervals.length; i++) {
          const next = rawIntervals[i];
          // Overlap or adjacency check (within 60s)
          if (next.start <= current.end + 60) {
            // Merge
            current.end = Math.max(current.end, next.end);
          } else {
            // Push current and start new
            mergedIntervals.push(current);
            current = next;
          }
        }
        mergedIntervals.push(current);
      }

      return {
        name: alertName,
        rawName: alertName,
        intervals: mergedIntervals,
        color: getDynamicColor(alertName),
      };
    })
    .filter((row) => row.intervals.length > 0);

  const formatTick = (ts: number) => {
    const d = new Date(ts * 1000);
    if (duration <= 3600 * 2)
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (duration <= 86400)
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (duration <= 86400 * 7)
      return d.toLocaleDateString([], { weekday: "short", hour: "numeric" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const headerHeight = 24;
  const rowHeight = 28;

  return (
    <Panel
      title={panel.title}
      onClick={() => onClick?.({ timeframe: localTf })}
      rightSection={controls}
    >
      <div className={chartClasses.alertPanelContainer}>
        <LoadingOverlay
          visible={loading}
          zIndex={1000}
          overlayProps={{ radius: "sm", blur: 2 }}
        />
        <div
          className={chartClasses.alertHeader}
          style={{ height: headerHeight }}
        >
          <div
            style={{ flexGrow: 1, position: "relative", overflow: "hidden" }}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
              <div
                key={pct}
                className={chartClasses.timelineTick}
                style={{
                  left: `${pct * 100}%`,
                }}
              >
                <Text
                  size="xs"
                  c="dimmed"
                  style={{ whiteSpace: "nowrap", fontSize: 10 }}
                >
                  {formatTick(start + duration * pct)}
                </Text>
              </div>
            ))}
          </div>
        </div>

        <ScrollArea style={{ flexGrow: 1 }} offsetScrollbars>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {rows.map((row) => (
              <div
                key={row.rawName}
                className={chartClasses.alertRow}
                style={{
                  height: rowHeight,
                }}
              >
                <div style={{ flexGrow: 1, position: "relative" }}>
                  {[0.25, 0.5, 0.75].map((pct) => (
                    <div
                      key={pct}
                      className={chartClasses.timelineGridLine}
                      style={{
                        left: `${pct * 100}%`,
                      }}
                    />
                  ))}

                  {row.intervals.map((int, j) => {
                    const leftPct =
                      Math.max(0, (int.start - start) / duration) * 100;
                    const widthPct = Math.min(
                      100,
                      ((int.end - int.start) / duration) * 100,
                    );
                    const visualWidth = Math.max(widthPct, 0.2);

                    return (
                      <Tooltip
                        key={j}
                        label={
                          <Box>
                            <Text size="xs" fw={700}>
                              {row.name}
                            </Text>
                            <Text size="xs">{`${new Date(int.start * 1000).toLocaleString()} - ${new Date(int.end * 1000).toLocaleString()}`}</Text>
                          </Box>
                        }
                        multiline
                      >
                        <Box
                          className={chartClasses.alertBar}
                          style={{
                            left: `${leftPct}%`,
                            width: `${visualWidth}%`,
                            backgroundColor: row.color,
                          }}
                        >
                          {widthPct > 15 && (
                            <Text
                              size="xs"
                              c={getContrastingTextColor(row.color)}
                              fw={600}
                              className={chartClasses.alertBarLabel}
                            >
                              {row.name}
                            </Text>
                          )}
                        </Box>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </Panel>
  );
}
