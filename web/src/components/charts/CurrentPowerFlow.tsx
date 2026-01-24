import {
  Text,
  Paper,
  Box,
  LoadingOverlay,
  Badge,
  useMantineTheme,
} from "@mantine/core";
import { IconHome, IconBattery } from "@tabler/icons-react";
import { PiSolarPanelFill } from "react-icons/pi";
import { LuUtilityPole } from "react-icons/lu";
import { VscDebugDisconnect } from "react-icons/vsc";

import { useState, useEffect, useRef, useMemo } from "react";
import { useResizeObserver } from "@mantine/hooks";
import { queryLatestMetrics } from "../../data";
import type { ChartComponentProps, MetricQuery } from "../../data";
import { Panel } from "../Panel";
import flowClasses from "./CurrentPowerFlow.module.scss";
import { useDataRefresh } from "../../utils";

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
  alert?: React.ReactNode;
}

function FlowNode({
  title,
  value,
  icon,
  color,
  bgColor,
  subValue,
  boxSize,
  alert,
}: NodeProps) {
  const textOffset = boxSize / 2 + 4;
  return (
    <Box className={flowClasses.nodeBox}>
      {alert && <Box className={flowClasses.alertIcon}>{alert}</Box>}
      <Paper
        shadow="xs"
        p={8}
        radius="sm"
        bg={bgColor}
        className={flowClasses.nodePaper}
        style={{
          border: `2px solid var(--mantine-color-${color}-5)`,
          width: boxSize,
          height: boxSize,
        }}
      >
        {icon}
      </Paper>
      <Box
        className={flowClasses.nodeLabelContainer}
        style={{
          bottom: textOffset,
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

// Particle System Types
interface Point {
  x: number;
  y: number;
}

interface Particle {
  x: number;
  y: number;
  target: Point;
  color: string;
  speed: number;
  path: Point[]; // Remaining waypoints
  id: number;
  source:
    | "Solar"
    | "GridImport"
    | "GridExport"
    | "BatteryDischarge"
    | "BatteryCharge"
    | "Home"
    | "BridgeLR"
    | "BridgeRL";
}

export function CurrentPowerFlow({
  height = 250,
  panel,
  timeframe,
  onClick,
}: ChartComponentProps) {
  const theme = useMantineTheme();
  const [ref, rect] = useResizeObserver();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const particleIdCounter = useRef(0);

  const actualWidth = rect.width;
  const actualHeight = rect.height;
  const [values, setValues] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [isGridConnected, setIsGridConnected] = useState(true);

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

      try {
        const gridRes = await fetch("/api/system_status/grid_status");
        if (gridRes.ok) {
          const gridData = await gridRes.json();
          setIsGridConnected(gridData.grid_status === "SystemGridConnected");
        }
      } catch (e) {
        console.warn("Failed to check grid status", e);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useDataRefresh(fetchData, 15000);

  const formatW = (val: number, signed = false) => {
    const abs = Math.abs(val);
    const prefix = signed && val < 0 ? "-" : "";
    if (abs >= 1000) return `${prefix}${(abs / 1000).toFixed(1)} kW`;
    return `${prefix}${abs.toFixed(0)} W`;
  };

  const pSolar = Math.max(0, values["Solar"] || 0);
  const pBattery = values["Battery"] || 0; // +Discharge, -Charge
  const pGrid = values["Grid"] || 0; // +Import, -Export
  const pHome = Math.max(0, values["Home"] || 0);
  /* test data
  const pSolar = 0;
  const pBattery = 5000;
  const pHome = 4900;
  const pGrid = -100;
  */
  // Derived Flows at Junctions
  // TrunkL (Left Junction): Connects Solar, Grid, Bridge
  // TrunkR (Right Junction): Connects Home, Battery, Bridge
  const bridgeFlow = pSolar + pGrid;

  // Colors
  const cSolar = theme.colors.yellow[4];
  const cGrid = theme.colors.red[4];
  const cBatt = theme.colors.green[4];
  const cHome = theme.colors.blue[4];
  const cBridge =
    bridgeFlow > 0
      ? pSolar > 0 && pGrid > 0
        ? theme.colors.orange[4]
        : pSolar > 0
          ? cSolar
          : cGrid
      : pBattery > 0
        ? cBatt
        : cHome; // Flowing Left? Rare/Impossible usually unless export from batt

  // Layout Constants
  const iconSize = Math.min(actualWidth / 12, 64);
  const boxSize = iconSize + 2;
  const leftX = actualWidth * 0.25 + boxSize / 2;
  const rightX = actualWidth * 0.75 - boxSize / 2;
  const center = actualWidth / 2;
  const vcenter = actualHeight / 2;
  const topY = actualHeight * 0.3;
  const bottomY = actualHeight * 0.75;
  const trunkOffset = Math.min(50, actualWidth * 0.08);
  const trunkL_X = center - trunkOffset;
  const trunkR_X = center + trunkOffset;

  const MIN_POWER = 10;
  const MIN_SPAWN_RATE = 0.2;
  const MIN_SPEED = 20;

  // Waypoints
  const points = useMemo(
    () => ({
      Solar: { x: leftX - boxSize / 2, y: topY - boxSize / 2 },
      Grid: { x: leftX - boxSize / 2, y: bottomY - boxSize / 2 },
      Home: { x: rightX - boxSize / 2, y: topY - boxSize / 2 },
      Battery: { x: rightX - boxSize / 2, y: bottomY - boxSize / 2 },
      TrunkL_Top: { x: trunkL_X - boxSize / 2, y: topY - boxSize / 2 },
      TrunkL_Bot: { x: trunkL_X - boxSize / 2, y: bottomY - boxSize / 2 },
      TrunkL_Mid: { x: trunkL_X - boxSize / 2, y: vcenter - boxSize / 2 },
      TrunkR_Top: { x: trunkR_X - boxSize / 2, y: topY - boxSize / 2 },
      TrunkR_Bot: { x: trunkR_X - boxSize / 2, y: bottomY - boxSize / 2 },
      TrunkR_Mid: { x: trunkR_X - boxSize / 2, y: vcenter - boxSize / 2 },
    }),
    [boxSize, leftX, rightX, topY, bottomY, trunkL_X, trunkR_X, vcenter],
  );

  // Particle Logic
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle high-DPI
    const dpr = window.devicePixelRatio || 1;
    canvas.width = actualWidth * dpr;
    canvas.height = actualHeight * dpr;
    ctx.scale(dpr, dpr);

    let lastTime = performance.now();
    const spawnAccumulator: Record<string, number> = {
      Solar: 0,
      GridImport: 0,
      GridExport: 0,
      BatteryDischarge: 0,
      BatteryCharge: 0,
      Home: 0,
      BridgeLR: 0,
      BridgeRL: 0,
    };

    const animate = (time: number) => {
      let dt = (time - lastTime) / 1000;
      lastTime = time;

      // Cap dt to prevent massive jumps (e.g. when tab loses focus)
      if (dt > 0.1) dt = 0.1;

      // Remove particles on paths where power is now 0 or direction flipped
      particlesRef.current = particlesRef.current.filter((p) => {
        if (p.source === "Solar") return pSolar > MIN_POWER;
        if (p.source === "GridImport") return pGrid > MIN_POWER;
        if (p.source === "GridExport") return pGrid < -MIN_POWER;
        if (p.source === "BatteryDischarge") return pBattery > MIN_POWER;
        if (p.source === "BatteryCharge") return pBattery < -MIN_POWER;
        if (p.source === "Home") return pHome > MIN_POWER;
        if (p.source === "BridgeLR") return bridgeFlow > MIN_POWER;
        if (p.source === "BridgeRL") return bridgeFlow < -MIN_POWER;
        return true;
      });

      ctx.clearRect(0, 0, actualWidth, actualHeight);

      // Draw Paths (Static Background Lines)
      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const drawPath = (pts: Point[], color: string) => {
        if (pts.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.3;
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      };

      // Solar Path
      if (pSolar > 0)
        drawPath([points.Solar, points.TrunkL_Top, points.TrunkL_Mid], cSolar);
      // Grid Path (Import/Export)
      if (pGrid !== 0)
        drawPath([points.Grid, points.TrunkL_Bot, points.TrunkL_Mid], cGrid);
      // Battery Path (Charge/Discharge)
      if (pBattery !== 0)
        drawPath([points.Battery, points.TrunkR_Bot, points.TrunkR_Mid], cBatt);
      // Home Path
      if (pHome > 0)
        drawPath([points.TrunkR_Mid, points.TrunkR_Top, points.Home], cHome);
      // Bridge Path
      if (Math.abs(bridgeFlow) > 0)
        drawPath([points.TrunkL_Mid, points.TrunkR_Mid], cBridge);

      // Spawning Logic
      const calculateSpeed = (watts: number) => {
        return Math.max(MIN_SPEED, 3 * Math.sqrt(watts));
      };

      const calculateRate = (watts: number) => {
        if (watts <= MIN_POWER) return 0;
        return Math.max(MIN_SPAWN_RATE, Math.log(watts / 1000));
      };

      const trySpawn = (
        source: Particle["source"],
        watts: number,
        startPath: Point[],
        color: string,
      ) => {
        const rate = calculateRate(watts);
        spawnAccumulator[source] += rate * dt;
        if (spawnAccumulator[source] >= 1) {
          spawnAccumulator[source] -= 1;
          const p: Particle = {
            x: startPath[0].x,
            y: startPath[0].y,
            target: startPath[1],
            path: startPath.slice(2),
            speed: calculateSpeed(watts),
            color: color,
            id: particleIdCounter.current++,
            source: source,
          };
          particlesRef.current.push(p);
        }
      };

      // Spawn Sources
      if (pSolar > MIN_POWER)
        trySpawn(
          "Solar",
          pSolar,
          [points.Solar, points.TrunkL_Top, points.TrunkL_Mid],
          cSolar,
        );
      if (pGrid > MIN_POWER)
        trySpawn(
          "GridImport",
          pGrid,
          [points.Grid, points.TrunkL_Bot, points.TrunkL_Mid],
          cGrid,
        ); // Import
      if (pBattery > MIN_POWER)
        trySpawn(
          "BatteryDischarge",
          pBattery,
          [points.Battery, points.TrunkR_Bot, points.TrunkR_Mid],
          cBatt,
        ); // Discharge

      // Update Particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];

        // Move towards target
        const dx = p.target.x - p.x;
        const dy = p.target.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < p.speed * dt) {
          // Reached target
          p.x = p.target.x;
          p.y = p.target.y;

          // Logic at Junctions
          // Junction Logic: Update Speed & Path
          if (p.x === points.TrunkL_Mid.x && p.y === points.TrunkL_Mid.y) {
            const flowExport = Math.max(0, -pGrid);
            const flowBridge = Math.max(0, bridgeFlow);

            const targets: any[] = [];
            if (flowExport > MIN_POWER)
              targets.push({
                t: points.TrunkL_Bot,
                path: [points.Grid],
                c: cGrid,
                s: calculateSpeed(flowExport),
                src: "GridExport",
              });
            if (flowBridge > MIN_POWER)
              targets.push({
                t: points.TrunkR_Mid,
                path: [],
                c: cBridge,
                s: calculateSpeed(Math.abs(bridgeFlow)),
                src: "BridgeLR",
              });

            if (targets.length > 0) {
              const first = targets[0];
              p.target = first.t;
              p.path = first.path;
              p.color = first.c;
              if (first.s !== undefined) p.speed = first.s;
              p.source = first.src;

              for (let k = 1; k < targets.length; k++) {
                const next = targets[k];
                particlesRef.current.push({
                  x: p.x,
                  y: p.y,
                  target: next.t,
                  path: next.path,
                  color: next.c,
                  speed: next.s !== undefined ? next.s : p.speed,
                  source: next.src,
                  id: particleIdCounter.current++,
                });
              }
            } else {
              particlesRef.current.splice(i, 1);
              continue;
            }
          } else if (
            p.x === points.TrunkR_Mid.x &&
            p.y === points.TrunkR_Mid.y
          ) {
            const flowToHome = pHome;
            const flowToBatt = Math.max(0, -pBattery);
            const flowToBridge = bridgeFlow < 0 ? Math.abs(bridgeFlow) : 0;

            const targets: any[] = [];
            if (flowToBatt > MIN_POWER)
              targets.push({
                t: points.TrunkR_Bot,
                path: [points.Battery],
                c: cBatt,
                s: calculateSpeed(flowToBatt),
                src: "BatteryCharge",
              });
            if (flowToHome > MIN_POWER)
              targets.push({
                t: points.TrunkR_Top,
                path: [points.Home],
                c: cHome,
                s: calculateSpeed(flowToHome),
                src: "Home",
              });
            if (flowToBridge > MIN_POWER)
              targets.push({
                t: points.TrunkL_Mid,
                path: [],
                c: cBridge,
                s: calculateSpeed(flowToBridge),
                src: "BridgeRL",
              });

            if (targets.length > 0) {
              const first = targets[0];
              p.target = first.t;
              p.path = first.path;
              p.color = first.c;
              if (first.s !== undefined) p.speed = first.s;
              p.source = first.src;

              for (let k = 1; k < targets.length; k++) {
                const next = targets[k];
                particlesRef.current.push({
                  x: p.x,
                  y: p.y,
                  target: next.t,
                  path: next.path,
                  color: next.c,
                  speed: next.s !== undefined ? next.s : p.speed,
                  source: next.src,
                  id: particleIdCounter.current++,
                });
              }
            } else {
              particlesRef.current.splice(i, 1);
              continue;
            }
          }
          // Normal Path following
          else if (p.path.length > 0) {
            p.target = p.path.shift()!;
          } else {
            // End of line
            particlesRef.current.splice(i, 1);
            continue;
          }
        } else {
          // Move
          const moveDist = p.speed * dt;
          p.x += (dx / dist) * moveDist;
          p.y += (dy / dist) * moveDist;
        }

        // Draw Particle
        const gradient = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, 4);
        gradient.addColorStop(0, "white");
        gradient.addColorStop(0.4, p.color);
        gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [
    cBatt,
    actualWidth,
    actualHeight,
    points,
    pSolar,
    pGrid,
    pBattery,
    pHome,
    bridgeFlow,
    cBridge,
    cGrid,
    cHome,
    cSolar,
  ]); // Re-bind on metric change

  return (
    <Panel title={panel.title} onClick={() => onClick?.({ timeframe })}>
      <Box ref={ref} h={height} pos="relative">
        <LoadingOverlay
          visible={loading}
          zIndex={1000}
          overlayProps={{ radius: "sm", blur: 2 }}
        />

        {!isGridConnected && (
          <Box className={flowClasses.alertBadge}>
            <Badge
              color="red"
              size="lg"
              variant="filled"
              leftSection={<VscDebugDisconnect size={16} />}
            >
              OFF GRID
            </Badge>
          </Box>
        )}

        {/* Canvas Layer */}
        <Box className={flowClasses.svgLayer}>
          <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />
        </Box>

        {/* Content Layer (Nodes) */}
        <Box
          className={flowClasses.nodePosition}
          style={{ top: topY - boxSize / 2, left: leftX - boxSize / 2 }}
        >
          <FlowNode
            title="Solar"
            value={formatW(pSolar, true)}
            icon={
              <PiSolarPanelFill
                size={iconSize}
                color="var(--mantine-color-yellow-7)"
              />
            }
            color="yellow"
            bgColor="yellow.1"
            boxSize={boxSize}
          />
        </Box>

        <Box
          className={flowClasses.nodePosition}
          style={{ top: topY - boxSize / 2, left: rightX - boxSize / 2 }}
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
          className={flowClasses.nodePosition}
          style={{ top: bottomY - boxSize / 2, left: leftX - boxSize / 2 }}
        >
          <FlowNode
            title="Grid"
            value={formatW(pGrid, true)}
            icon={
              isGridConnected ? (
                <LuUtilityPole
                  size={iconSize}
                  color="var(--mantine-color-red-7)"
                />
              ) : (
                <VscDebugDisconnect
                  size={iconSize}
                  color="var(--mantine-color-red-9)"
                />
              )
            }
            color="red"
            bgColor={isGridConnected ? "red.1" : "red.2"}
            boxSize={boxSize}
          />
        </Box>

        <Box
          className={flowClasses.nodePosition}
          style={{ top: bottomY - boxSize / 2, left: rightX - boxSize / 2 }}
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
