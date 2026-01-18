import { Container, ActionIcon, useMantineColorScheme, useComputedColorScheme, Affix, Group, Title, Box, Image, SegmentedControl, Stack, Collapse, Loader, Center, Tooltip } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import { useWindowScroll, useDisclosure } from '@mantine/hooks';
import { IconSun, IconMoon, IconSettings, IconInfoCircle, IconHelp, IconHome, IconTool, IconPlayerPause, IconPlayerPlay } from '@tabler/icons-react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Suspense, lazy, useEffect } from 'react';
import { Tagline } from './components/Tagline';
import { TimeframeProvider, useGlobalTimeframe } from './contexts/TimeframeContext';
import { RefreshProvider, useRefresh } from './contexts/RefreshContext';
import classes from './App.module.css';

const Dashboard = lazy(() => import('./pages/Dashboard').then(module => ({ default: module.Dashboard })));
const Settings = lazy(() => import('./pages/Settings').then(module => ({ default: module.Settings })));
const Status = lazy(() => import('./pages/Status'));
const Troubleshoot = lazy(() => import('./pages/Troubleshoot'));
const ChartDetail = lazy(() => import('./pages/ChartDetail').then(module => ({ default: module.ChartDetail })));

function AppContent() {
  const { setColorScheme, toggleColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const [scroll] = useWindowScroll();
  const isScrolled = scroll.y > 50;
  const [opened, { toggle, close }] = useDisclosure(false);
  const { globalTimeframe, setGlobalTimeframe, isMixed } = useGlobalTimeframe();
  const { isPaused, setPaused } = useRefresh();
  const location = useLocation();
  const isDashboard = location.pathname === '/';

  useEffect(() => {
    fetch('/api/v1/settings')
      .then(res => res.json())
      .then(data => {
        const config = data.config;
        if (config) {
          // Set initial pause state (paused if auto-refresh is false)
          setPaused(!config['auto-refresh']);
          
          // Set theme
          const theme = config['default-theme'];
          if (theme === 'dark' || theme === 'light') {
            setColorScheme(theme);
          } else {
            setColorScheme('auto');
          }
        }
      })
      .catch(console.error);
  }, []); // Only on mount

  return (
      <Box pb="xl">
        <Notifications position="top-right" zIndex={2000} autoClose={6000} />
        {/* Persistent Floating Sidebar (Left) */}
        <Affix position={{ top: 20, left: 20 }} zIndex={100}>
            <Stack gap="sm" align="flex-start">
                <Box onClick={toggle} style={{ cursor: 'pointer' }}>
                    {isScrolled ? (
                        <ActionIcon 
                            variant="default" 
                            size="xl" 
                            radius="xl" 
                            className={classes.scrolledLogo}
                            aria-label="Menu"
                        >
                            <Image src="/images/power_dash_logo_transparent.png" h={24} w="auto" />
                        </ActionIcon>
                    ) : (
                        <Group gap="sm" align="center" wrap="nowrap">
                            <Image 
                                src="/images/power_dash_logo_with_name_transparent.png"
                                h={56}
                                w="auto"
                                className={classes.logo}
                            />
                            <Box className={classes.headerInfoVisible}>
                                <Title order={2} className={classes.title}>Power Dash</Title>
                                <Tagline />
                            </Box>
                        </Group>
                    )}
                </Box>

                <Collapse in={opened}>
                    <Stack gap="xs">
                        <ActionIcon 
                            component={Link} 
                            to="/" 
                            radius="xl" 
                            size="xl" 
                            variant="default" 
                            aria-label="Home" 
                            title="Dashboard"
                            onClick={close}
                        >
                            <IconHome size={24} />
                        </ActionIcon>

                        <ActionIcon 
                            component={Link} 
                            to="/settings" 
                            radius="xl" 
                            size="xl" 
                            variant="default" 
                            aria-label="Settings" 
                            title="Settings"
                            onClick={close}
                        >
                            <IconSettings size={24} />
                        </ActionIcon>
                        
                        <ActionIcon 
                            component={Link}
                            to="/status"
                            radius="xl" 
                            size="xl" 
                            variant="default" 
                            aria-label="Status" 
                            title="System Status"
                            onClick={close}
                        >
                            <IconInfoCircle size={24} />
                        </ActionIcon>

                        <ActionIcon 
                            component={Link}
                            to="/troubleshoot"
                            radius="xl" 
                            size="xl" 
                            variant="default" 
                            aria-label="Troubleshoot" 
                            title="Troubleshooting"
                            onClick={close}
                        >
                            <IconTool size={24} />
                        </ActionIcon>

                        <ActionIcon 
                            radius="xl" 
                            size="xl" 
                            variant="default" 
                            aria-label="Help" 
                            title="Help"
                            onClick={close}
                        >
                            <IconHelp size={24} />
                        </ActionIcon>
                    </Stack>
                </Collapse>
            </Stack>
        </Affix>

        {/* Static Header Area (Scrolls away) */}
        <Box component="header" py="xl" px="xl">
            <Group justify="flex-end" align="flex-start">
                {/* Right Side: Controls */}
                <Group gap="xs">
                                        {isDashboard && (
                                            <>
                                            <SegmentedControl
                                                value={globalTimeframe}
                                                onChange={(val) => {
                                                    setGlobalTimeframe(val);
                                                }}
                                                onClick={() => {
                                                    // If we are in mixed state, any click on the control should unify the dashboard
                                                    if (isMixed) {
                                                        setGlobalTimeframe(globalTimeframe);
                                                    }
                                                }}
                                                size="md"                            radius="sm"
                            data={[
                                { label: '1h', value: '1h' },
                                { label: '1d', value: '24h' },
                                { label: '1w', value: '7d' },
                                { label: '1m', value: '30d' },
                                { label: '1y', value: '1y' },
                                { label: 'All', value: 'all' }
                            ]}
                            styles={{
                                root: { 
                                    backgroundColor: computedColorScheme === 'dark' ? 'var(--mantine-color-dark-6)' : 'var(--mantine-color-gray-1)',
                                    boxShadow: 'var(--mantine-shadow-sm)',
                                    border: `1px solid ${computedColorScheme === 'dark' ? 'var(--mantine-color-dark-4)' : 'var(--mantine-color-gray-3)'}`,
                                    padding: 2
                                },
                                label: {
                                    fontWeight: 700,
                                    paddingLeft: 20,
                                    paddingRight: 20,
                                    color: computedColorScheme === 'dark' ? 'var(--mantine-color-gray-3)' : 'var(--mantine-color-gray-7)'
                                },
                                indicator: {
                                    backgroundColor: isMixed 
                                        ? (computedColorScheme === 'dark' ? 'var(--mantine-color-dark-4)' : 'var(--mantine-color-blue-0)')
                                        : (computedColorScheme === 'dark' ? 'var(--mantine-color-dark-4)' : 'var(--mantine-color-white)')
                                    ,
                                    backgroundImage: isMixed ? `repeating-linear-gradient(45deg, transparent, transparent 5px, ${computedColorScheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(34, 139, 230, 0.1)'} 5px, ${computedColorScheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(34, 139, 230, 0.1)'} 10px)` : undefined,
                                    boxShadow: computedColorScheme === 'dark' ? 'none' : 'var(--mantine-shadow-xs)'
                                }
                            }}
                        />
                        <Tooltip label={isPaused ? "Resume Auto-Refresh" : "Pause Auto-Refresh"}>
                            <ActionIcon 
                                size="38px" 
                                variant="default" 
                                radius="sm" 
                                onClick={() => setPaused(!isPaused)}
                                style={{
                                    backgroundColor: computedColorScheme === 'dark' ? 'var(--mantine-color-dark-6)' : 'var(--mantine-color-gray-1)',
                                    border: `1px solid ${computedColorScheme === 'dark' ? 'var(--mantine-color-dark-4)' : 'var(--mantine-color-gray-3)'}`,
                                }}
                            >
                                {isPaused ? <IconPlayerPlay size={20} color="var(--mantine-color-teal-6)" /> : <IconPlayerPause size={20} color={computedColorScheme === 'dark' ? 'var(--mantine-color-dark-2)' : 'var(--mantine-color-gray-6)'} />}
                            </ActionIcon>
                        </Tooltip>
                        </>
                    )}
                </Group>
            </Group>
        </Box>

        {/* Floating Dark Mode (Bottom Right) */}
        <Affix position={{ bottom: 20, right: 20 }} zIndex={100}>
            <ActionIcon radius="xl" size="xl" variant="default" onClick={() => toggleColorScheme()} aria-label="Toggle Color Scheme">
                {computedColorScheme === 'dark' ? <IconSun size={24} /> : <IconMoon size={24} />}
            </ActionIcon>
        </Affix>

        <Container fluid px="xl" pt={0}>
            {/* Main Content */}
            <Suspense fallback={<Center h="50vh"><Loader size="xl" /></Center>}>
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/status" element={<Status />} />
                    <Route path="/troubleshoot" element={<Troubleshoot />} />
                    <Route path="/chart/:panelName/:metricLabel?" element={<ChartDetail />} />
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
                <AppContent />
            </TimeframeProvider>
        </RefreshProvider>
    </BrowserRouter>
  );
}
