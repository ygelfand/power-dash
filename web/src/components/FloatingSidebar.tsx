import {
  Affix,
  Stack,
  Box,
  ActionIcon,
  Image,
  Group,
  Title,
  Collapse,
  Paper,
} from "@mantine/core";
import { useWindowScroll, useDisclosure, useMediaQuery } from "@mantine/hooks";
import {
  IconHome,
  IconSettings,
  IconInfoCircle,
  IconTool,
  IconHelp,
  IconCoin,
  IconTags,
} from "@tabler/icons-react";
import { Link, useLocation } from "react-router-dom";
import classes from "../App.module.scss";
import { Tagline } from "./Tagline";
import { HeaderControls } from "./HeaderControls";
import { GlobalTimeframeControl } from "./GlobalTimeframeControl";

function MenuItems({ close }: { close: () => void }) {
  return (
    <>
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
        to="/cost"
        radius="xl"
        size="xl"
        variant="default"
        aria-label="Cost"
        title="Cost Analysis"
        onClick={close}
      >
        <IconCoin size={24} />
      </ActionIcon>

      <ActionIcon
        component={Link}
        to="/labels"
        radius="xl"
        size="xl"
        variant="default"
        aria-label="Labels"
        title="Label Mappings"
        onClick={close}
      >
        <IconTags size={24} />
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
    </>
  );
}

export function FloatingSidebar() {
  const [scroll] = useWindowScroll();
  const isScrolled = scroll.y > 50;
  const [opened, { toggle, close }] = useDisclosure(false);
  const isMobile = useMediaQuery("(max-width: 48em)");
  const location = useLocation();
  const isDashboard = location.pathname === "/";

  if (isMobile) {
    return (
      <Paper
        p="md"
        radius={0}
        shadow="xs"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 99,
          borderBottom: "1px solid var(--mantine-color-gray-2)",
        }}
      >
        <Group justify="space-between" align="center">
          <Box onClick={toggle} style={{ cursor: "pointer" }}>
            <Group gap="sm" align="center" wrap="nowrap">
              <Image
                src="/images/power_dash_logo_transparent.png"
                h={32}
                w="auto"
              />
              <Title order={3} className={classes.title}>
                Power Dash
              </Title>
            </Group>
          </Box>
          {isDashboard && <HeaderControls hideTimeframe />}
        </Group>
        <Collapse in={opened}>
          <Group gap="xs" mt="sm" justify="center">
            {isDashboard && <GlobalTimeframeControl />}
            <MenuItems close={close} />
          </Group>
        </Collapse>
      </Paper>
    );
  }

  return (
    <Affix position={{ top: 20, left: 20 }} zIndex={100}>
      <Stack gap="sm" align="flex-start">
        <Box onClick={toggle} className={classes.sidebarToggle}>
          {isScrolled ? (
            <ActionIcon
              variant="default"
              size="xl"
              radius="xl"
              className={classes.scrolledLogo}
              aria-label="Menu"
            >
              <Image
                src="/images/power_dash_logo_transparent.png"
                h={24}
                w="auto"
              />
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
                <Title order={2} className={classes.title}>
                  Power Dash
                </Title>
                <Tagline />
              </Box>
            </Group>
          )}
        </Box>

        <Collapse in={opened}>
          <Stack gap="xs">
            <MenuItems close={close} />
          </Stack>
        </Collapse>
      </Stack>
    </Affix>
  );
}