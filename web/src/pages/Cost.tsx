import {
  Container,
  Title,
  Paper,
  Text,
  Group,
  Stack,
  ThemeIcon,
  SimpleGrid,
  Box,
  useComputedColorScheme,
  Select,
} from "@mantine/core";
import { IconCoin, IconCalendarTime } from "@tabler/icons-react";
import { useConfig } from "../contexts/ConfigContext";
import { useMemo, useState, useEffect } from "react";
import { ResponsiveHeatMap } from "@nivo/heatmap";
import classes from "./Cost.module.scss";

export function Cost() {
  const { config, loading } = useConfig();
  const colorScheme = useComputedColorScheme("light");
  const tariff = config?.site_info?.tariff_content;

  const seasons = useMemo(() => Object.keys(tariff?.seasons || {}), [tariff]);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);

  useEffect(() => {
    if (seasons.length > 0 && !selectedSeason) {
      setSelectedSeason(seasons.includes("Summer") ? "Summer" : seasons[0]);
    }
  }, [seasons, selectedSeason]);

  const ratesToShow = useMemo(() => {
    const charges = tariff?.energy_charges || {};
    const allKey = Object.keys(charges).find(k => k.toUpperCase() === "ALL");
    const base = { ...(allKey ? charges[allKey] : {}) };
    const seasonKey = Object.keys(charges).find(k => k.toLowerCase() === selectedSeason?.toLowerCase());
    if (seasonKey) Object.assign(base, charges[seasonKey]);
    return base;
  }, [tariff, selectedSeason]);

  const { heatMapData, maxRate } = useMemo(() => {
    if (!tariff?.seasons || !selectedSeason) return { heatMapData: [], maxRate: 0.1 };

    const season = tariff.seasons[selectedSeason];
    const touPeriods = Object.entries(season.tou_periods || {});
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    let currentMax = 0.1;

    const data = days.map((dayName, d) => {
      // Tesla 0=Mon, 6=Sun. JS 0=Sun
      const teslaDay = (d + 6) % 7;
      
      const dayCells = Array.from({ length: 24 }, (_, h) => {
        let rate = 0;
        let periodName = "Flat";
        const currMin = h * 60;

        if (touPeriods.length > 0) {
          periodName = "Unknown";
          for (const [pName, periods] of touPeriods) {
            const match = (periods as any[]).some(p => {
              if (teslaDay < (p.fromDayOfWeek ?? 0) || teslaDay > (p.toDayOfWeek ?? 0)) return false;
              const start = (p.fromHour ?? 0) * 60 + (p.fromMinute ?? 0);
              const end = (p.toHour ?? 0) * 60 + (p.toMinute ?? 0);
              if (start === 0 && end === 0) return true;
              return start < end ? (currMin >= start && currMin < end) : (currMin >= start || currMin < end);
            });

            if (match) {
              rate = ratesToShow[pName] ?? 0;
              periodName = pName;
              break;
            }
          }
        } else {
          rate = ratesToShow[selectedSeason] ?? ratesToShow["ALL"] ?? ratesToShow["All"] ?? Object.values(ratesToShow)[0] ?? 0;
        }

        if (rate > currentMax) currentMax = rate;
        return { x: `${h}`, y: rate, value: rate, period: periodName };
      });

      return { id: dayName, data: dayCells };
    });

    return { heatMapData: data, maxRate: currentMax };
  }, [tariff, selectedSeason, ratesToShow]);

  if (loading) return <Text>Loading...</Text>;
  if (!tariff) return <Text>No tariff configuration found.</Text>;

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Group>
            <ThemeIcon size="lg" variant="light" color="green"><IconCoin size={20} /></ThemeIcon>
            <Title order={2}>Energy Costs</Title>
          </Group>
          <Stack gap={0} align="flex-end">
            <Text fw={700}>{tariff.utility}</Text>
            <Text c="dimmed" size="xs">{tariff.name} ({tariff.code})</Text>
          </Stack>
        </Group>

        <Paper p="md" withBorder>
          <Stack>
            <Group justify="space-between">
              <Group gap="xs"><IconCalendarTime size={20} className={classes.iconFaded} /><Text fw={500}>Rate Schedule</Text></Group>
              <Select size="xs" data={seasons} value={selectedSeason} onChange={setSelectedSeason} allowDeselect={false} />
            </Group>

            <Box h={400} w="100%">
              <ResponsiveHeatMap
                data={heatMapData}
                margin={{ top: 60, right: 20, bottom: 60, left: 60 }}
                valueFormat=">-.4f"
                axisTop={{ tickSize: 5, tickPadding: 5, tickRotation: -90, legend: "Hour of Day", legendOffset: -46 }}
                axisLeft={{ tickSize: 5, tickPadding: 5, tickRotation: 0, legend: "Day of Week", legendPosition: "middle", legendOffset: -40 }}
                colors={{ type: "sequential", scheme: "yellow_orange_red", minValue: 0, maxValue: maxRate }}
                theme={{
                  text: { fill: colorScheme === "dark" ? "#C1C2C5" : "#1A1B1E" },
                  tooltip: { container: { background: colorScheme === "dark" ? "#25262B" : "#FFFFFF", color: colorScheme === "dark" ? "#C1C2C5" : "#1A1B1E" } }
                }}
                tooltip={({ cell }) => (
                  <Paper p="xs" shadow="md" withBorder>
                    <Text size="xs" fw={700}>{cell.serieId} @ {cell.data.x}:00</Text>
                    <Text size="sm" c="blue">${Number(cell.value).toFixed(4)} / kWh</Text>
                    <Text size="xs" c="dimmed">{(cell.data as any).period}</Text>
                  </Paper>
                )}
              />
            </Box>
          </Stack>
        </Paper>

        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <Paper p="md" withBorder>
            <Title order={4} mb="md">Rates ({selectedSeason})</Title>
            <Stack gap="xs">
              {Object.entries(ratesToShow).map(([name, rate]) => (
                <Group key={name} justify="space-between">
                  <Text size="sm">{name}</Text>
                  <Text fw={700} size="sm">${(rate as number).toFixed(4)} / kWh</Text>
                </Group>
              ))}
            </Stack>
          </Paper>

          <Paper p="md" withBorder>
            <Title order={4} mb="md">Site Details</Title>
            <Stack gap="xs">
              {[
                { l: "Region", v: config?.site_info?.region },
                { l: "Timezone", v: config?.site_info?.timezone },
                { l: "Nominal Energy", v: `${config?.site_info?.nominal_system_energy_ac} kWh` },
                { l: "Backup Reserve", v: `${config?.site_info?.backup_reserve_percent}%` }
              ].map(i => (
                <Group key={i.l} justify="space-between">
                  <Text size="sm" c="dimmed">{i.l}</Text>
                  <Text size="sm">{i.v}</Text>
                </Group>
              ))}
            </Stack>
          </Paper>
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
