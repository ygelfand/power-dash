import { Text, Paper, Box, LoadingOverlay } from "@mantine/core";
import { IconSun, IconHome, IconPlug, IconBattery } from "@tabler/icons-react";
import { useState, useEffect } from "react";
import { useResizeObserver } from "@mantine/hooks";
import { queryLatestMetrics } from "../../data";
import type { ChartComponentProps, MetricQuery } from "../../data";
import { Panel } from "../Panel";
import classes from "../ChartPanel.module.css";

export const CurrentPowerFlowDefaults = {
  title: "Current State",
  component: "CurrentPowerFlow",
  size: 4,
};

interface NodeProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  subValue?: string;
  boxSize: number;
}

function FlowNode({
  title,
  value,
  icon,
  color,
  bgColor,
  subValue,
  boxSize,
}: NodeProps) {
  const textOffset = boxSize / 2 + 4;
  return (
    <Box style={{ position: "relative" }}>
      <Paper
        shadow="xs"
        p={8}
        radius="sm"
        bg={bgColor}
        style={{
          border: `2px solid var(--mantine-color-${color}-5)`,
          position: "absolute",
          transform: "translate(-50%, -50%)",
          top: 0,
          left: 0,
          width: boxSize,
          height: boxSize,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 10,
        }}
      >
        {icon}
      </Paper>
      <Box
        style={{
          position: "absolute",
          bottom: textOffset,
          textAlign: "center",
          width: 160,
          left: -80,
          pointerEvents: "none",
        }}
      >
        <Text
          fw={800}
          size={boxSize > 50 ? "md" : "sm"}
          style={{ lineHeight: 1.1 }}
        >
          {value}
        </Text>
        {subValue && (
          <Text
            style={{
              fontSize: boxSize > 50 ? "12px" : "10px",
              lineHeight: 1.1,
            }}
            fw={700}
            c={`${color}.7`}
          >
            {subValue}
          </Text>
        )}
        <Text
          style={{ fontSize: boxSize > 50 ? "12px" : "10px", lineHeight: 1.1 }}
          c="dimmed"
          fw={600}
          tt="uppercase"
        >
          {title}
        </Text>
      </Box>
    </Box>
  );
}

export function CurrentPowerFlow({
  height = 250,
  panel,
  timeframe,
  onClick,
}: ChartComponentProps) {
  const [ref, rect] = useResizeObserver();
  const actualWidth = rect.width;
  const actualHeight = rect.height;
  const [values, setValues] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const metrics: MetricQuery[] = [
        { name: "power_watts", label: "Grid", tags: { site: "site" } },
        { name: "power_watts", label: "Home", tags: { site: "load" } },
        { name: "power_watts", label: "Solar", tags: { site: "solar" } },
        { name: "power_watts", label: "Battery", tags: { site: "battery" } },
        { name: "battery_soe_percent", label: "SoE" },
      ];

      try {
        const results = await queryLatestMetrics(metrics);
        const latest: Record<string, number> = {};
        Object.keys(results).forEach((key) => {
          latest[key] = results[key].Value;
        });
        setValues(latest);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatW = (val: number, signed = false) => {
    const abs = Math.abs(val);
    const prefix = signed && val < 0 ? "-" : "";
    if (abs >= 1000) return `${prefix}${(abs / 1000).toFixed(1)} kW`;
    return `${prefix}${abs.toFixed(0)} W`;
  };

  const pSolar = values["Solar"] || 0;
  const pBattery = values["Battery"] || 0;
  const pGrid = values["Grid"] || 0;
  const pHome = values["Home"] || 0;
  const getDuration = (val: number) => {
    const abs = Math.abs(val);
    if (abs < 10) return 0;
    return Math.max(0.5, 9 - Math.log(abs));
  };
  const bridgePower = pSolar + pGrid;
  const bridgeColor =
    pSolar > 0 && pGrid > 0
      ? "--mantine-color-orange-4"
      : pSolar > 0
        ? "--mantine-color-yellow-4"
        : pGrid > 0
          ? "--mantine-color-red-4"
          : "--mantine-color-gray-4";
  // Responsive breakpoints based on pixel width
  const iconSize = Math.min(actualWidth / 12, 64);
  const minimumPower = 3;
  const boxSize = iconSize + 2;
  const leftPct = "25%";
  const rightPct = "75%";
  const topPct = "30%";
  const bottomPct = "75%";
  const leftX = actualWidth * 0.25 + boxSize / 2;
  const centerShift = 50;
  const rightX = actualWidth * 0.75 - boxSize / 2;
  const center = actualWidth / 2;
  const vcenter = actualHeight / 2;
  const topY = actualHeight * 0.3;
  const bottomY = actualHeight * 0.75;
  return (
    <Panel title={panel.title} onClick={() => onClick?.({ timeframe })}>
      <Box ref={ref} h={height} pos="relative">
        <LoadingOverlay
          visible={loading}
          zIndex={1000}
          overlayProps={{ radius: "sm", blur: 2 }}
        />
        {/* SVG Background Layer for Paths */}
        <Box
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: "none",
            zIndex: 1,
          }}
        >
          <svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
            {/* Solar -> TrunkL */}
            {pSolar > minimumPower && (
              <path
                d={`M ${leftX} ${topY} L ${center - centerShift} ${topY} L ${center - centerShift} ${vcenter}`}
                className={classes.flowAnimation}
                style={{
                  stroke: "var(--mantine-color-yellow-4)",
                  animationDuration: `${getDuration(pSolar)}s`,
                }}
              />
            )}

            {/* Grid <-> TrunkL */}
            {Math.abs(pGrid) > minimumPower && (
              <path
                d={
                  pGrid > 0
                    ? `M ${leftX} ${bottomY} L ${center - centerShift} ${bottomY} L ${center - centerShift} ${vcenter}`
                    : `M ${center - centerShift} ${vcenter} L ${center - centerShift} ${bottomY} L ${leftX} ${bottomY}`
                }
                className={classes.flowAnimation}
                style={{
                  stroke: "var(--mantine-color-red-4)",
                  animationDuration: `${getDuration(pGrid)}s`,
                }}
              />
            )}

            {/* Battery <-> TrunkR */}
            {Math.abs(pBattery) > minimumPower && (
              <path
                d={
                  pBattery > 0
                    ? `M ${rightX} ${bottomY} L ${center + centerShift} ${bottomY} L ${center + centerShift} ${vcenter}`
                    : `M ${center + centerShift} ${vcenter} L ${center + centerShift} ${bottomY} L ${rightX} ${bottomY}`
                }
                className={classes.flowAnimation}
                style={{
                  stroke: "var(--mantine-color-green-4)",
                  animationDuration: `${getDuration(pBattery)}s`,
                }}
              />
            )}

            {/* TrunkR -> Home */}
            {pHome > minimumPower && (
              <path
                d={`M ${center + centerShift} ${vcenter} L ${center + centerShift} ${topY} L ${rightX} ${topY}`}
                className={classes.flowAnimation}
                style={{
                  stroke: "var(--mantine-color-blue-4)",
                  animationDuration: `${getDuration(pHome)}s`,
                }}
              />
            )}

            {/* Bridge: TrunkL <-> TrunkR */}
            {Math.abs(bridgePower) > minimumPower && (
              <path
                d={
                  bridgePower > 0
                    ? `M ${center - centerShift} ${vcenter} L ${center + centerShift} ${vcenter}`
                    : `M ${center + centerShift} ${vcenter} L ${center - centerShift} ${vcenter}`
                }
                className={classes.flowAnimation}
                style={{
                  stroke: `var(${bridgeColor})`,
                  animationDuration: `${getDuration(bridgePower)}s`,
                }}
              />
            )}
          </svg>
        </Box>

        {/* Content Layer (Absolute Positioned Nodes aligned with SVG) */}
        <Box
          style={{
            position: "absolute",
            top: topPct,
            left: leftPct,
            zIndex: 10,
          }}
        >
          <FlowNode
            title="Solar"
            value={formatW(pSolar, true)}
            icon={
              <IconSun size={iconSize} color="var(--mantine-color-yellow-7)" />
            }
            color="yellow"
            bgColor="yellow.1"
            boxSize={boxSize}
          />
        </Box>

        <Box
          style={{
            position: "absolute",
            top: topPct,
            left: rightPct,
            zIndex: 10,
          }}
        >
          <FlowNode
            title="Home"
            value={formatW(pHome)}
            icon={
              <IconHome size={iconSize} color="var(--mantine-color-blue-7)" />
            }
            color="blue"
            bgColor="blue.1"
            boxSize={boxSize}
          />
        </Box>

        <Box
          style={{
            position: "absolute",
            top: bottomPct,
            left: leftPct,
            zIndex: 10,
          }}
        >
          <FlowNode
            title="Grid"
            value={formatW(pGrid, true)}
            icon={
              <IconPlug size={iconSize} color="var(--mantine-color-red-7)" />
            }
            color="red"
            bgColor="red.1"
            boxSize={boxSize}
          />
        </Box>

        <Box
          style={{
            position: "absolute",
            top: bottomPct,
            left: rightPct,
            zIndex: 10,
          }}
        >
          <FlowNode
            title="Battery"
            value={formatW(pBattery, true)}
            icon={
              <IconBattery
                size={iconSize}
                color="var(--mantine-color-green-7)"
              />
            }
            color="green"
            bgColor="green.1"
            subValue={`${Math.round(values["SoE"] || 0)}%`}
            boxSize={boxSize}
          />
        </Box>
      </Box>
    </Panel>
  );
}
