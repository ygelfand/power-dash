import { Container, Title, Grid, Card, Text, Badge, Group, Stack, Table, Loader, Center, Divider, Tooltip, SimpleGrid } from "@mantine/core";
import { IconCpu, IconInfoCircle, IconActivity, IconBolt, IconSun, IconGauge, IconAlertTriangle, IconWorld, IconShieldCheck, IconCoin, IconTruck } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useConfig } from "../contexts/ConfigContext";
import classes from "./Status.module.scss";

interface StatusData {
  version?: string;
  system: {
    version: string;
    git_hash: string;
    din: string;
  };
  site: {
    site_name: string;
    timezone: string;
    panel_max_current: number;
    nominal_system_power_kW: number;
    grid_code: {
        grid_code: string;
        utility: string;
        region: string;
        grid_phase_setting: string;
    };
  };
  live: {
    components: {
      msa: any[];
    };
    esCan: {
      bus: {
        ISLANDER: any;
        MSA: any;
        PINV: any[];
        PVAC: any[];
        PVS: any[];
        POD: any[];
        THC: any[];
      }
    };
    control: {
      batteryBlocks: any[];
      islanding: {
        gridOK: boolean;
        microGridOK: boolean;
        contactorClosed: boolean;
      };
      systemStatus: {
        nominalEnergyRemainingWh: number;
        nominalFullPackEnergyWh: number;
      };
      alerts: {
        active: string[];
      };
    };
    neurio: {
      readings: any[];
    };
    system: {
      time: string;
    }
  }
}

function formatGitHash(hash: any): string {
  if (!hash) return "N/A";
  if (Array.isArray(hash)) {
    return hash.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 8);
  }
  return String(hash).substring(0, 8);
}

export default function Status() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const { config } = useConfig();

  useEffect(() => {
    fetch("/api/v1/status")
      .then(res => res.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <Center h="80vh">
        <Stack align="center">
          <Loader size="xl" />
          <Text c="dimmed">Fetching system inventory...</Text>
        </Stack>
      </Center>
    );
  }

  if (!data) return <Center h="80vh"><Text>Failed to load system status</Text></Center>;

  const { live, system, site } = data;

  const activePINVs = live?.esCan?.bus?.PINV?.filter(c => !c.PINV_Status?.isMIA) || [];
  const activePVACs = live?.esCan?.bus?.PVAC?.filter(c => !c.PVAC_Status?.isMIA) || [];
  const activePODs = live?.esCan?.bus?.POD?.filter(c => c.POD_EnergyStatus && !c.POD_EnergyStatus.isMIA) || [];
  const systemAlerts = live?.control?.alerts?.active || [];

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        <Group justify="space-between" align="flex-start">
          <Stack gap={0}>
            <Title order={1}>{site?.site_name || "System"} Status</Title>
            <Text c="dimmed" size="sm">Hardware inventory and real-time controller state</Text>
            <Group gap="xs" mt={4}>
                <Badge variant="outline" color="blue" radius="xs" size="sm">PD: {data.version || "N/A"}</Badge>
                <Badge variant="outline" color="gray" radius="xs" size="sm">FW: {system?.version || "N/A"}</Badge>
                <Badge variant="outline" color="gray" radius="xs" size="sm">DIN: {system?.din || "N/A"}</Badge>
                {config?.vin && <Badge variant="outline" color="gray" radius="xs" size="sm">VIN: {config.vin}</Badge>}
            </Group>
          </Stack>
          <Badge size="xl" variant="dot" color={live?.control?.islanding?.gridOK ? "green" : "red"}>
            {live?.control?.islanding?.gridOK ? "Grid Connected" : "Islanded"}
          </Badge>
        </Group>

        <Grid>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Card shadow="sm" padding="lg" radius="md" withBorder h="100%">
              <Group mb="xs">
                <IconActivity size={24} color="var(--mantine-color-blue-6)" />
                <Text fw={700}>System Health</Text>
              </Group>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">System Time</Text>
                  <Text size="sm" fw={500}>{live?.system?.time || "N/A"}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Contactor State</Text>
                  <Badge color={live?.control?.islanding?.contactorClosed ? "green" : "orange"} variant="light">
                    {live?.control?.islanding?.contactorClosed ? "Closed" : "Open"}
                  </Badge>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Active Alerts</Text>
                  <Badge color={systemAlerts.length > 0 ? "blue" : "gray"} variant="outline">
                    {systemAlerts.length}
                  </Badge>
                </Group>
              </Stack>
            </Card>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 4 }}>
            <Card shadow="sm" padding="lg" radius="md" withBorder h="100%">
              <Group mb="xs">
                <IconWorld size={24} color="var(--mantine-color-teal-6)" />
                <Text fw={700}>Grid Configuration</Text>
              </Group>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Utility</Text>
                  <Text size="sm" fw={500} truncate maw={180}>{site?.grid_code?.utility || "N/A"}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Region</Text>
                  <Badge variant="light" color="teal" size="sm">{site?.grid_code?.region || "N/A"}</Badge>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Phase / Rating</Text>
                  <Text size="sm" fw={500}>{site?.grid_code?.grid_phase_setting} / {site?.panel_max_current}A</Text>
                </Group>
              </Stack>
            </Card>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 4 }}>
            <Card shadow="sm" padding="lg" radius="md" withBorder h="100%">
              <Group mb="xs">
                <IconShieldCheck size={24} color="var(--mantine-color-violet-6)" />
                <Text fw={700}>Inventory Summary</Text>
              </Group>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Powerwalls</Text>
                  <Badge variant="outline">{activePODs.length}</Badge>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Battery Inverters</Text>
                  <Badge variant="outline">{activePINVs.length}</Badge>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Solar Inverters</Text>
                  <Badge variant="outline">{activePVACs.length}</Badge>
                </Group>
              </Stack>
            </Card>
          </Grid.Col>
        </Grid>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            {config?.site_info?.tariff_content && (
            <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Group mb="xs">
                <IconCoin size={24} color="var(--mantine-color-green-6)" />
                <Text fw={700}>Tariff & Site Info</Text>
                </Group>
                <Stack gap="xs">
                    <Group justify="space-between">
                        <Text size="sm" c="dimmed">Tariff Name</Text>
                        <Text size="sm" fw={500}>{config.site_info.tariff_content.name}</Text>
                    </Group>
                    <Group justify="space-between">
                        <Text size="sm" c="dimmed">Tariff Code</Text>
                        <Badge variant="outline" color="green">{config.site_info.tariff_content.code}</Badge>
                    </Group>
                    <Group justify="space-between">
                        <Text size="sm" c="dimmed">Export Rule</Text>
                        <Badge variant="light" color="cyan">{config.site_info.customer_preferred_export_rule || "N/A"}</Badge>
                    </Group>
                    <Group justify="space-between">
                        <Text size="sm" c="dimmed">Commissioned</Text>
                        <Text size="sm">{config.site_info.battery_commission_date ? new Date(config.site_info.battery_commission_date).toLocaleDateString() : "N/A"}</Text>
                    </Group>
                </Stack>
            </Card>
            )}

            {config?.installer && (
            <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Group mb="xs">
                <IconTruck size={24} color="var(--mantine-color-orange-6)" />
                <Text fw={700}>Installer & Support</Text>
                </Group>
                <Stack gap="xs">
                    <Group justify="space-between">
                        <Text size="sm" c="dimmed">Company</Text>
                        <Text size="sm" fw={500}>{config.installer.company || "N/A"}</Text>
                    </Group>
                    <Group justify="space-between">
                        <Text size="sm" c="dimmed">Phone</Text>
                        <Text size="sm">{config.installer.phone || "N/A"}</Text>
                    </Group>
                    <Group justify="space-between">
                        <Text size="sm" c="dimmed">Installation Type</Text>
                        <Badge variant="light" color="orange">{config.installer.solar_installation_type || "N/A"}</Badge>
                    </Group>
                    <Group justify="space-between">
                        <Text size="sm" c="dimmed">Customer Status</Text>
                        <Badge color={config.customer?.registered ? "teal" : "gray"} variant="outline">
                            {config.customer?.registered ? "Registered" : "Unregistered"}
                        </Badge>
                    </Group>
                </Stack>
            </Card>
            )}
        </SimpleGrid>

        {systemAlerts.length > 0 && (
          <Card 
            shadow="sm" 
            radius="md" 
            withBorder 
            className={classes.alertCard}
          >
            <Group mb="xs">
              <IconAlertTriangle size={20} color="var(--mantine-color-blue-6)" />
              <Text fw={700} size="sm">Active System Notifications</Text>
            </Group>
            <Group gap="xs">
              {systemAlerts.map((a, i) => (
                <Badge key={i} variant="light" color="blue" size="sm">{a}</Badge>
              ))}
            </Group>
          </Card>
        )}

        <Divider label="Detailed Components" labelPosition="center" />

        <Card shadow="sm" radius="md" withBorder p={0}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Component</Table.Th>
                <Table.Th>Identifier</Table.Th>
                <Table.Th>Hardware Details</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {/* MSA / Islander */}
              {live?.esCan?.bus?.ISLANDER && (
                <Table.Tr>
                  <Table.Td><Group gap="xs"><IconInfoCircle size={16} /><Text size="sm" fw={500}>Backup Gateway</Text></Group></Table.Td>
                  <Table.Td><Text size="xs" ff="monospace">{live.components?.msa?.[2]?.serialNumber || live.components?.msa?.[0]?.serialNumber || "N/A"}</Text></Table.Td>
                  <Table.Td><Text size="xs">FW: {live.components?.msa?.[2]?.signals?.find((s: any) => s.name === "MSA_appGitHash")?.textValue || "N/A"}</Text></Table.Td>
                  <Table.Td><Badge size="xs" color="green">ONLINE</Badge></Table.Td>
                </Table.Tr>
              )}

              {/* Powerwalls (POD) */}
              {activePODs.map((_, i) => (
                <Table.Tr key={`pod-${i}`}>
                  <Table.Td><Group gap="xs"><IconCpu size={16} color="teal" /><Text size="sm" fw={500}>Powerwall Pack {i}</Text></Group></Table.Td>
                  <Table.Td><Text size="xs" ff="monospace">{config?.battery_blocks?.[i]?.vin || live?.control?.batteryBlocks?.[i]?.din?.split('#')[1] || "N/A"}</Text></Table.Td>
                  <Table.Td><Text size="xs">SOE: {config?.battery_blocks?.[i]?.min_soe}% - {config?.battery_blocks?.[i]?.max_soe}%</Text></Table.Td>
                  <Table.Td><Badge size="xs" variant="light" color="teal">HEALTHY</Badge></Table.Td>
                </Table.Tr>
              ))}

              {/* Battery Inverters (PINV) */}
              {activePINVs.map((m, i) => (
                <Table.Tr key={`pinv-${i}`}>
                  <Table.Td><Group gap="xs"><IconBolt size={16} color="orange" /><Text size="sm" fw={500}>Battery Inverter {i}</Text></Group></Table.Td>
                  <Table.Td><Text size="xs" ff="monospace">Internal</Text></Table.Td>
                  <Table.Td><Text size="xs">-</Text></Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      <Badge size="xs" variant="light" color="green">{m.PINV_Status?.PINV_State?.replace('PINV_', '') || 'Active'}</Badge>
                      {m.alerts?.active?.map((a: string, ai: number) => <Tooltip key={ai} label={a}><Badge size="xs" color="red" variant="filled">!</Badge></Tooltip>)}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}

              {/* Solar Inverters (PVAC) */}
              {activePVACs.map((m, i) => (
                <Table.Tr key={`pvac-${i}`}>
                  <Table.Td><Group gap="xs"><IconSun size={16} color="yellow" /><Text size="sm" fw={500}>Solar Inverter {i}</Text></Group></Table.Td>
                  <Table.Td><Text size="xs" ff="monospace">{m.packageSerialNumber || "N/A"}</Text></Table.Td>
                  <Table.Td><Text size="xs">FW: {formatGitHash(m.PVAC_InfoMsg?.PVAC_appGitHash)}</Text></Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      <Badge size="xs" variant="light" color="yellow">{m.PVAC_Status?.PVAC_State?.replace('PVAC_', '') || 'Active'}</Badge>
                      {m.alerts?.active?.map((a: string, ai: number) => <Tooltip key={ai} label={a}><Badge size="xs" color="red" variant="filled">!</Badge></Tooltip>)}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}

              {/* Solar Strings (PVS) */}
              {live?.esCan?.bus?.PVS?.filter(c => !c.PVS_Status?.isMIA).map((m, i) => (
                <Table.Tr key={`pvs-${i}`}>
                  <Table.Td><Group gap="xs"><IconSun size={16} color="yellow" /><Text size="sm" fw={500}>Solar String Ctrl {i}</Text></Group></Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {['A','B','C','D'].map(s => (
                        <Badge key={s} size="xs" variant={m.PVS_Status?.[`PVS_String${s}_Connected`] ? "filled" : "outline"} color="yellow">{s}</Badge>
                      ))}
                    </Group>
                  </Table.Td>
                  <Table.Td>-</Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      <Badge size="xs" variant="light" color="green">{m.PVS_Status?.PVS_State?.replace('PVS_', '') || 'Active'}</Badge>
                      {m.alerts?.active?.map((a: string, ai: number) => <Tooltip key={ai} label={a}><Badge size="xs" color="red" variant="filled">!</Badge></Tooltip>)}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}

              {/* Neurio & Metering Infrastructure */}
              {config?.meters?.map((m, i) => (
                <Table.Tr key={`meter-${i}`}>
                  <Table.Td><Group gap="xs"><IconGauge size={16} color="violet" /><Text size="sm" fw={500}>Meter: {m.location}</Text></Group></Table.Td>
                  <Table.Td><Text size="xs" ff="monospace">{m.connection?.device_serial || "N/A"}</Text></Table.Td>
                  <Table.Td>
                      <Stack gap={0}>
                        <Text size="xs">Type: {m.type}</Text>
                        {m.connection?.ip_address && <Text size="xs">IP: {m.connection.ip_address}</Text>}
                      </Stack>
                  </Table.Td>
                  <Table.Td><Badge size="xs" variant="light" color="violet">CONFIGURED</Badge></Table.Td>
                </Table.Tr>
              ))}

              {/* Live Neurio Readings (if any not covered by config or for status) */}
              {live?.neurio?.readings?.map((m: any, i: number) => (
                <Table.Tr key={`neurio-live-${i}`}>
                  <Table.Td><Group gap="xs"><IconGauge size={16} color="violet" /><Text size="sm" fw={500}>Neurio Live</Text></Group></Table.Td>
                  <Table.Td><Text size="xs" ff="monospace">{m.serial}</Text></Table.Td>
                  <Table.Td><Text size="xs">FW: {m.firmwareVersion || "N/A"}</Text></Table.Td>
                  <Table.Td><Badge size="xs" variant="light" color="green">ONLINE</Badge></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      </Stack>
    </Container>
  );
}
