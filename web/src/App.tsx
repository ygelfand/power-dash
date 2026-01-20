import {
  Container,
  ActionIcon,
  useMantineColorScheme,
  useComputedColorScheme,
  Affix,
  Group,
  Box,
  Loader,
  Center,
} from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import "@mantine/notifications/styles.css";
import "@mantine/code-highlight/styles.css";
import {
  IconSun,
  IconMoon,
} from "@tabler/icons-react";
import { useMediaQuery } from "@mantine/hooks";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import { FloatingSidebar } from "./components/FloatingSidebar";
import { HeaderControls } from "./components/HeaderControls";
import {
  TimeframeProvider,
} from "./contexts/TimeframeContext";
import { RefreshProvider, useRefresh } from "./contexts/RefreshContext";
import { ConfigProvider } from "./contexts/ConfigContext";
import { LabelProvider } from "./contexts/LabelContext";

const Dashboard = lazy(() =>
  import("./pages/Dashboard").then((module) => ({ default: module.Dashboard })),
);
const Settings = lazy(() =>
  import("./pages/Settings").then((module) => ({ default: module.Settings })),
);
const Labels = lazy(() =>
  import("./pages/Labels").then((module) => ({ default: module.Labels })),
);
const Cost = lazy(() =>
  import("./pages/Cost").then((module) => ({ default: module.Cost })),
);
const Status = lazy(() => import("./pages/Status"));
const Troubleshoot = lazy(() => import("./pages/Troubleshoot"));
const ChartDetail = lazy(() =>
  import("./pages/ChartDetail").then((module) => ({
    default: module.ChartDetail,
  })),
);

function AppContent() {
  const { setColorScheme, toggleColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme("light", {
    getInitialValueInEffect: true,
  });
  const { setPaused } = useRefresh();
  const location = useLocation();
  const isDashboard = location.pathname === "/";
  const isMobile = useMediaQuery("(max-width: 48em)");

  useEffect(() => {
    fetch("/api/v1/settings")
      .then((res) => res.json())
      .then((data) => {
        const config = data.config;
        if (config) {
          // Set initial pause state (paused if auto-refresh is false)
          setPaused(!config["auto-refresh"]);

          // Set theme
          const theme = config["default-theme"];
          if (theme === "dark" || theme === "light") {
            setColorScheme(theme);
          } else {
            setColorScheme("auto");
          }
        }
      })
      .catch(console.error);
  }, []); // Only on mount

  return (
    <Box pb="xl">
      <Notifications position="top-right" zIndex={2000} autoClose={6000} />
      {/* Persistent Floating Sidebar (Left) */}
      <FloatingSidebar />

      {/* Static Header Area (Scrolls away) - Desktop Only */}
      {!isMobile && (
        <Box component="header" py="xl" px="xl">
          <Group justify="flex-end" align="flex-start">
            {/* Right Side: Controls */}
            <Group gap="xs">{isDashboard && <HeaderControls />}</Group>
          </Group>
        </Box>
      )}

      {/* Floating Dark Mode (Bottom Right) */}
      <Affix position={{ bottom: 20, right: 20 }} zIndex={100}>
        <ActionIcon
          radius="xl"
          size="xl"
          variant="default"
          onClick={() => toggleColorScheme()}
          aria-label="Toggle Color Scheme"
        >
          {computedColorScheme === "dark" ? (
            <IconSun size={24} />
          ) : (
            <IconMoon size={24} />
          )}
        </ActionIcon>
      </Affix>

      <Container fluid px={{ base: 0, sm: "xl" }} pt={0}>
        {/* Main Content */}
        <Suspense
          fallback={
            <Center h="50vh">
              <Loader size="xl" />
            </Center>
          }
        >
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/labels" element={<Labels />} />
            <Route path="/cost" element={<Cost />} />
            <Route path="/status" element={<Status />} />
            <Route path="/troubleshoot" element={<Troubleshoot />} />
            <Route
              path="/chart/:panelName/:metricLabel?"
              element={<ChartDetail />}
            />
          </Routes>
        </Suspense>
      </Container>
    </Box>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <RefreshProvider>
        <TimeframeProvider>
          <ConfigProvider>
            <LabelProvider>
              <AppContent />
            </LabelProvider>
          </ConfigProvider>
        </TimeframeProvider>
      </RefreshProvider>
    </BrowserRouter>
  );
}
