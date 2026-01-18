import {
  Affix,
  Stack,
  Box,
  ActionIcon,
  Image,
  Group,
  Title,
  Collapse,
} from "@mantine/core";
import { useWindowScroll, useDisclosure } from "@mantine/hooks";
import {
  IconHome,
  IconSettings,
  IconInfoCircle,
  IconTool,
  IconHelp,
} from "@tabler/icons-react";
import { Link } from "react-router-dom";
import classes from "../App.module.css";
import { Tagline } from "./Tagline";

export function FloatingSidebar() {
  const [scroll] = useWindowScroll();
  const isScrolled = scroll.y > 50;
  const [opened, { toggle, close }] = useDisclosure(false);

  return (
    <Affix position={{ top: 20, left: 20 }} zIndex={100}>
      <Stack gap="sm" align="flex-start">
        <Box onClick={toggle} style={{ cursor: "pointer" }}>
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
  );
}
