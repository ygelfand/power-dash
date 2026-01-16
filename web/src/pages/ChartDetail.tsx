import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, useMemo, useRef } from "react";
import { Container, ActionIcon, Center, Loader, Affix } from "@mantine/core";
import uPlot from "uplot";
import { IconArrowLeft, IconX } from "@tabler/icons-react";
import { fetchDashboards } from "../data";
import type { PanelConfig, DashboardConfig } from "../data";
import { DynamicPanel } from "../components/DynamicPanel";
import { ErrorBoundary } from "../components/ErrorBoundary";
import classes from "../components/ChartPanel.module.css";

export function ChartDetail() {
  const { panelName, metricLabel } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const initialState = location.state as {
    timeframe?: string;
    zoom?: [number, number];
    panel?: PanelConfig;
  } | null;

  const [panel, setPanel] = useState<PanelConfig | null>(initialState?.panel || null);
  const [timeframe, setTimeframe] = useState<string>(initialState?.timeframe || "24h");
  const [loading, setLoading] = useState(!initialState?.panel);
  const [isZoomed, setIsZoomed] = useState(!!initialState?.zoom);
  const uplotRef = useRef<uPlot | null>(null);

  const selectedMetric = metricLabel || null;
  const zoomKey = JSON.stringify(initialState?.zoom);

  useEffect(() => {
    // If panel is already loaded from state, we are done
    if (panel) {
        return;
    }

    fetchDashboards()
      .then((dashboards: DashboardConfig[]) => {
        // Find panel across all dashboards
        for (const db of dashboards) {
          const found = (db.panels || []).find(
            (p: PanelConfig) => p.name === panelName,
          );
          if (found) {
            setPanel(found);
            setTimeframe(initialState?.timeframe || db.timeframe || "24h");
            break;
          }
        }
        setLoading(false);
      })
      .catch((err: Error) => {
        console.error(err);
        setLoading(false);
      });
  }, [panelName, panel, initialState?.timeframe]);

  // Apply zoom if present in state
  useEffect(() => {
    if (!loading && uplotRef.current && initialState?.zoom) {
      const [min, max] = initialState.zoom;
      uplotRef.current.setScale("x", { min, max });
    }
  }, [loading, zoomKey, initialState?.zoom]);

  const filteredPanel = useMemo(() => {
    if (!panel) return null;
    if (!selectedMetric) return panel;
    return {
      ...panel,
      title: `${panel.title} - ${selectedMetric}`,
      params: {
        ...panel.params,
        selectedMetric,
      },
    };
  }, [panel, selectedMetric]);

  if (loading)
    return (
      <Center pt={100}>
        <Loader />
      </Center>
    );
  if (!panel) return <Center pt={100}>Panel not found</Center>;

  return (
    <Container fluid px={0} py="xl" pt={40}>
      {/* Floating Action Button (Unified) */}
      <Affix position={{ top: 20, right: 20 }} zIndex={100}>
        <ActionIcon
          variant="default"
          size="xl"
          radius="md"
          onClick={() => {
            if (selectedMetric) {
              navigate(`/chart/${panelName}`, {
                state: {
                  timeframe,
                  zoom: isZoomed
                    ? [
                        uplotRef.current?.scales.x.min,
                        uplotRef.current?.scales.x.max,
                      ]
                    : undefined,
                },
              });
            } else {
              navigate("/");
            }
          }}
          aria-label={selectedMetric ? "Show all metrics" : "Go back"}
          className={classes.actionIconDetail}
        >
          {selectedMetric ? <IconX size={24} /> : <IconArrowLeft size={24} />}
        </ActionIcon>
      </Affix>

      <ErrorBoundary>
        <DynamicPanel
          panel={filteredPanel!}
          timeframe={timeframe}
          height={500}
          onSelect={(label) =>
            navigate(`/chart/${panelName}/${label}`, {
              state: {
                timeframe,
                zoom: isZoomed
                  ? [
                      uplotRef.current?.scales.x.min,
                      uplotRef.current?.scales.x.max,
                    ]
                  : undefined,
              },
            })
          }
          onCreate={(u) => (uplotRef.current = u)}
          onZoom={setIsZoomed}
          showLegend={true}
        />
      </ErrorBoundary>
    </Container>
  );
}
