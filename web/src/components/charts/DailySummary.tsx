import {
  SimpleGrid,
  Paper,
  Text,
  Group,
  ThemeIcon,
  Center,
  Loader,
  Stack,
} from "@mantine/core";
import {
  IconBattery,
  IconHome,
  IconArrowUpRight,
  IconArrowDownLeft,
} from "@tabler/icons-react";
import { LuUtilityPole } from "react-icons/lu";
import { PiSolarPanelFill } from "react-icons/pi";

import { useState } from "react";
import { batchQueryMetrics } from "../../data";
import { type MetricQuery } from "../../data";
import { useDataRefresh } from "../../utils";
export const DailySummaryDefaults = {
  title: "Today's Summary",
  component: "DailySummary",
  size: 12,
  height: 80,
};

interface StatCardProps {
  title: string;
  value: string;
  unit: string;
  icon: React.ElementType;
  color: string;
  iconRight?: React.ReactNode;
}

function StatCard({
  title,
  value,
  unit,
  icon: Icon,
  color,
  iconRight,
}: StatCardProps) {
  return (
    <Paper
      withBorder
      p="md"
      radius="md"
      style={{
        flex: 1,
        backgroundColor: `var(--mantine-color-${color}-light)`,
        borderColor: `var(--mantine-color-${color}-3)`,
      }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Stack gap={0}>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed">
            {title}
          </Text>
          <Group align="baseline" gap={4}>
            <Text size="xl" fw={700}>
              {value}
            </Text>
            <Text size="sm" fw={500} c="dimmed">
              {unit}
            </Text>
            {iconRight}
          </Group>
        </Stack>
        <ThemeIcon variant="filled" color={color} size={48} radius="md">
          <Icon size={28} />
        </ThemeIcon>
      </Group>
    </Paper>
  );
}

export function DailySummary() {
  const [data, setData] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const now = new Date();
    const end = Math.floor(now.getTime() / 1000);
    now.setHours(0, 0, 0, 0);
    const start = Math.floor(now.getTime() / 1000);

    const metrics: MetricQuery[] = [
      { name: "power_watts", label: "Solar", tags: { site: "solar" } },
      { name: "power_watts", label: "Home", tags: { site: "load" } },
      {
        name: "power_watts",
        label: "Grid Import",
        tags: { site: "site_import" },
      },
      {
        name: "power_watts",
        label: "Grid Export",
        tags: { site: "site_export" },
      },
      {
        name: "power_watts",
        label: "Battery Import",
        tags: { site: "battery_import" },
      },
      {
        name: "power_watts",
        label: "Battery Export",
        tags: { site: "battery_export" },
      },
    ];

    try {
      const results = await batchQueryMetrics(
        metrics,
        start,
        end,
        3600, // Large step since we just want the integral
        "integral",
      );

      const totals: Record<string, number> = {};
      Object.keys(results).forEach((key) => {
        const sum = results[key].reduce((acc, p) => acc + p.Value, 0);
        totals[key] = sum / 3600; // Ws to Wh
      });

      setData(totals);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useDataRefresh(fetchData, 60000); // Refresh every minute

  if (loading) {
    return (
      <Center p="md">
        <Loader size="sm" />
      </Center>
    );
  }

  const solar = data["Solar"] || 0;
  const home = data["Home"] || 0;
  const gridNet = (data["Grid Import"] || 0) - (data["Grid Export"] || 0);
  const batteryNet =
    (data["Battery Export"] || 0) - (data["Battery Import"] || 0);

  const formatValue = (val: number) => {
    const abs = Math.abs(val);
    if (abs >= 1000) return (val / 1000).toFixed(1);
    return val.toFixed(0);
  };

  const getUnit = (val: number) => {
    return Math.abs(val) >= 1000 ? "kWh" : "Wh";
  };

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
      <StatCard
        title="Solar Production"
        value={formatValue(solar)}
        unit={getUnit(solar)}
        icon={PiSolarPanelFill}
        color="yellow"
      />
      <StatCard
        title="Home Usage"
        value={formatValue(home)}
        unit={getUnit(home)}
        icon={IconHome}
        color="blue"
      />
      <StatCard
        title="Net Grid"
        value={formatValue(gridNet)}
        unit={getUnit(gridNet)}
        icon={LuUtilityPole}
        color={gridNet >= 0 ? "red" : "teal"}
        iconRight={
          gridNet >= 0 ? (
            <IconArrowDownLeft size={16} color="var(--mantine-color-red-7)" />
          ) : (
            <IconArrowUpRight size={16} color="var(--mantine-color-teal-7)" />
          )
        }
      />
      <StatCard
        title="Net Battery"
        value={formatValue(batteryNet)}
        unit={getUnit(batteryNet)}
        icon={IconBattery}
        color="green"
      />
    </SimpleGrid>
  );
}
