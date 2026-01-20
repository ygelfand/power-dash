import {
  Group,
  Tooltip,
  ActionIcon,
  useComputedColorScheme,
} from "@mantine/core";
import {
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
} from "@tabler/icons-react";
import { useRefresh } from "../contexts/RefreshContext";
import { GlobalTimeframeControl } from "./GlobalTimeframeControl";

interface HeaderControlsProps {
  hideTimeframe?: boolean;
}

export function HeaderControls({ hideTimeframe }: HeaderControlsProps) {
  const computedColorScheme = useComputedColorScheme("light", {
    getInitialValueInEffect: true,
  });
  const { isPaused, setPaused, manualRefresh, isRefreshing } = useRefresh();

  return (
    <Group gap="xs">
      {!hideTimeframe && <GlobalTimeframeControl />}
      <Tooltip label={isPaused ? "Resume Auto-Refresh" : "Pause Auto-Refresh"}>
        <ActionIcon
          size="38px"
          variant="default"
          radius="sm"
          onClick={() => setPaused(!isPaused)}
          style={{
            backgroundColor:
              computedColorScheme === "dark"
                ? "var(--mantine-color-dark-6)"
                : "var(--mantine-color-gray-1)",
            border: `1px solid ${computedColorScheme === "dark" ? "var(--mantine-color-dark-4)" : "var(--mantine-color-gray-3)"}`,
          }}
        >
          {isPaused ? (
            <IconPlayerPlay size={20} color="var(--mantine-color-teal-6)" />
          ) : (
            <IconPlayerPause
              size={20}
              color={
                computedColorScheme === "dark"
                  ? "var(--mantine-color-dark-2)"
                  : "var(--mantine-color-gray-6)"
              }
            />
          )}
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Reload Data">
        <ActionIcon
          size="38px"
          variant="default"
          radius="sm"
          onClick={manualRefresh}
          style={{
            backgroundColor:
              computedColorScheme === "dark"
                ? "var(--mantine-color-dark-6)"
                : "var(--mantine-color-gray-1)",
            border: `1px solid ${computedColorScheme === "dark" ? "var(--mantine-color-dark-4)" : "var(--mantine-color-gray-3)"}`,
          }}
        >
          <IconRefresh
            size={20}
            color={
              computedColorScheme === "dark"
                ? "var(--mantine-color-dark-2)"
                : "var(--mantine-color-gray-6)"
            }
            style={{
              transition: "transform 1s ease-in-out",
              transform: isRefreshing ? "rotate(360deg)" : "none",
            }}
          />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}