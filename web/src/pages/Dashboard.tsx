import { Grid, Loader, Center } from "@mantine/core";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { fetchDashboards } from "../data";
import type { DashboardConfig } from "../data";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { DynamicPanel } from "../components/DynamicPanel";
import { useGlobalTimeframe } from "../contexts/TimeframeContext";
import classes from "../components/ChartPanel.module.css";

export function Dashboard() {
  const [dashboards, setDashboards] = useState<DashboardConfig[]>([]);
  const [selectedDashboard, setSelectedDashboard] = useState<string | null>(
    null,
  );
  const { globalTimeframe, setGlobalTimeframe, setMixed, isMixed } =
    useGlobalTimeframe();
  const [panelTimeframes, setPanelTimeframes] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const isFirstLoad = useRef(true);

  // Clear local overrides when global timeframe is re-asserted (mixed set to false)
  useEffect(() => {
    if (!isMixed) {
      setPanelTimeframes({});
    }
  }, [isMixed]);

  const handlePanelTimeframeChange = (panelName: string, tf: string) => {
    setPanelTimeframes((prev) => ({ ...prev, [panelName]: tf }));
    if (globalTimeframe && tf !== globalTimeframe) {
      setMixed(true);
    }
  };

  useEffect(() => {
    fetchDashboards()
      .then((data) => {
        const dashboardsList = data || [];
        setDashboards(dashboardsList);
        if (dashboardsList.length > 0) {
          setSelectedDashboard(dashboardsList[0].name);
          // Only set global timeframe once on mount to prevent snapping back
          if (isFirstLoad.current && dashboardsList[0].timeframe) {
            setGlobalTimeframe(dashboardsList[0].timeframe);
            isFirstLoad.current = false;
          }
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [setGlobalTimeframe]);

  if (loading)
    return (
      <Center pt={100}>
        <Loader />
      </Center>
    );

  const currentDashboard = (dashboards || []).find(
    (d) => d.name === selectedDashboard,
  );
  return (
    <div>
      <Grid gutter="md">
        {currentDashboard?.panels.map((panel, idx) => (
          <Grid.Col
            key={idx}
            span={{ base: 12, md: panel.size }}
            className={classes.overflowAnchorNone}
          >
            <ErrorBoundary>
              <DynamicPanel
                height={panel.height || 300}
                panel={panel}
                timeframe={
                  panelTimeframes[panel.name] || globalTimeframe || "24h"
                }
                onTimeframeChange={(tf) =>
                  handlePanelTimeframeChange(panel.name, tf)
                }
                onZoom={(z) => z && setMixed(true)}
                onClick={(state) => {
                  const currentTf =
                    panelTimeframes[panel.name] || globalTimeframe || "24h";
                  const isObject =
                    state &&
                    typeof state === "object" &&
                    !("nativeEvent" in state);
                  const navState = isObject
                    ? { ...state, panel }
                    : { panel, timeframe: currentTf };
                  navigate(`/chart/${panel.name}`, { state: navState });
                }}
              />
            </ErrorBoundary>
          </Grid.Col>
        ))}
      </Grid>
    </div>
  );
}
