import {
  Container,
  Title,
  Grid,
  Card,
  Text,
  Badge,
  Group,
  Stack,
  TextInput,
  PasswordInput,
  Select,
  Button,
  Switch,
  Divider,
  Alert,
  Loader,
  Center,
  Tooltip,
  Progress,
  Overlay,
  Box,
} from "@mantine/core";
import {
  IconDeviceFloppy,
  IconLock,
  IconLockOpen,
  IconAlertCircle,
  IconDatabase,
  IconNetwork,
  IconSettingsAutomation,
  IconCloudDownload,
  IconPlugConnected,
} from "@tabler/icons-react";
import { DatePickerInput } from "@mantine/dates";
import { useEffect, useState } from "react";
import { notifications } from "@mantine/notifications";
import "@mantine/dates/styles.css";

interface ImportStatus {
  active: boolean;
  total_chunks: number;
  current_chunk: number;
  message: string;
  error?: string;
  percentage: number;
}

export function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [writable, setWritable] = useState(false);
  const [configPath, setConfigPath] = useState("");
  const [config, setConfig] = useState<any>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  // Import State
  const [importHost, setImportHost] = useState("http://localhost:8086");
  const [importDB, setImportDB] = useState("powerwall");
  const [importUser, setImportUser] = useState("");
  const [importPass, setImportPass] = useState("");
  const [importRange, setImportRange] = useState<[Date | null, Date | null]>([
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    new Date(),
  ]);
  const [testing, setTesting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null);

  useEffect(() => {
    fetch("/api/v1/settings")
      .then((res) => res.json())
      .then((d) => {
        setConfig(d.config);
        setWritable(d.writable);
        setConfigPath(d.path);
        setOverrides(d.overrides || {});
        setLoading(false);
      })
      .catch((e) => {
        console.error(e);
        setLoading(false);
      });

    // Initial check for global import status
    fetch("/api/v1/import/status")
      .then((res) => res.json())
      .then((s) => setImportStatus(s));
  }, []);

  // Poll Import Status
  useEffect(() => {
    let interval: any;
    if (importing || importStatus?.active) {
      interval = setInterval(() => {
        fetch("/api/v1/import/status")
          .then((res) => res.json())
          .then((s) => {
            setImportStatus(s);
            if (s.active) {
              setImporting(true);
            } else if (importing) {
              setImporting(false);
              if (s.error) {
                notifications.show({
                  title: "Import Failed",
                  message: s.error,
                  color: "red",
                });
              } else {
                notifications.show({
                  title: "Import Finished",
                  message: "Data migration complete",
                  color: "green",
                });
              }
            }
          });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [importing, importStatus?.active]);

  const handleTestImport = async () => {
    setTesting(true);
    try {
      const resp = await fetch("/api/v1/import/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: importHost,
          database: importDB,
          user: importUser,
          password: importPass,
        }),
      });
      if (resp.ok) {
        notifications.show({
          title: "Connected",
          message: "InfluxDB connection successful",
          color: "green",
        });
      } else {
        const err = await resp.json();
        throw new Error(err.error);
      }
    } catch (e: any) {
      notifications.show({
        title: "Connection Failed",
        message: e.message,
        color: "red",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleRunImport = async () => {
    const start = importRange[0];
    const end = importRange[1];
    if (!start || !end) return;

    // Ensure we have actual Date objects
    const startDate = start instanceof Date ? start : new Date(start);
    const endDate = end instanceof Date ? end : new Date(end);

    setImporting(true);
    try {
      const resp = await fetch("/api/v1/import/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: importHost,
          database: importDB,
          user: importUser,
          password: importPass,
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        }),
      });
      if (resp.ok) {
        notifications.show({
          title: "Import Started",
          message: "Data migration is running in the background",
          color: "blue",
        });
      } else {
        const err = await resp.json();
        throw new Error(err.error);
      }
    } catch (e: any) {
      notifications.show({
        title: "Import Failed",
        message: e.message,
        color: "red",
      });
      setImporting(false);
    }
  };

  const renderOverride = (key: string) => {
    if (overrides[key]) {
      return (
        <Tooltip label="This setting is currently overridden by an environment variable or flag and cannot be changed here.">
          <Badge size="xs" variant="outline" color="blue" ml="xs">
            Overridden
          </Badge>
        </Tooltip>
      );
    }
    return null;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const resp = await fetch("/api/v1/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, path: configPath }),
      });
      if (resp.ok) {
        notifications.show({
          title: "Settings Saved",
          message:
            "Configuration updated successfully. Some changes may require a restart.",
          color: "green",
        });
      } else {
        const err = await resp.json();
        throw new Error(err.error);
      }
    } catch (e: any) {
      notifications.show({
        title: "Error Saving",
        message: e.message,
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <Center h="80vh">
        <Loader size="xl" />
      </Center>
    );
  if (!config)
    return (
      <Center h="80vh">
        <Text>Failed to load settings</Text>
      </Center>
    );

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        <Group justify="space-between" align="flex-start">
          <Stack gap={0}>
            <Title order={1}>Settings</Title>
            <Text c="dimmed" size="sm">
              Configure Power Dash system behavior and connectivity
            </Text>
          </Stack>
          <Group>
            {writable ? (
              <Badge
                color="green"
                variant="light"
                leftSection={<IconLockOpen size={14} />}
              >
                Config Writable
              </Badge>
            ) : (
              <Badge
                color="orange"
                variant="light"
                leftSection={<IconLock size={14} />}
              >
                Read-Only Mode
              </Badge>
            )}
            <Button
              leftSection={<IconDeviceFloppy size={18} />}
              disabled={!writable}
              loading={saving}
              onClick={handleSave}
            >
              Save Changes
            </Button>
          </Group>
        </Group>

        {!writable && (
          <Alert
            variant="light"
            color="orange"
            title="Configuration Locked"
            icon={<IconAlertCircle />}
          >
            The current configuration file{" "}
            <Text component="span" ff="monospace" fw={700}>
              {configPath}
            </Text>{" "}
            is not writable by the application. Settings can be viewed but not
            changed through the UI. To enable editing, give write permissions
            for the user running Power Dash.
          </Alert>
        )}

        <Grid>
          {/* API Connectivity */}
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Card shadow="sm" radius="md" withBorder>
              <Group mb="md">
                <IconNetwork size={20} color="var(--mantine-color-blue-6)" />
                <Text fw={700}>Tesla Powerwall Connectivity</Text>
              </Group>
              <Stack gap="sm">
                <TextInput
                  label={
                    <Group gap={0}>
                      Endpoint URL {renderOverride("endpoint")}
                    </Group>
                  }
                  description="IP or hostname of your Powerwall Gateway"
                  placeholder="https://192.168.91.1/"
                  value={config.endpoint}
                  disabled={!writable || !!overrides["endpoint"]}
                  onChange={(e) =>
                    setConfig({ ...config, endpoint: e.target.value })
                  }
                />
                <PasswordInput
                  label={
                    <Group gap={0}>
                      Installer Password {renderOverride("password")}
                    </Group>
                  }
                  description="Your Powerwall installer credentials"
                  value={config.password}
                  disabled={!writable || !!overrides["password"]}
                  onChange={(e) =>
                    setConfig({ ...config, password: e.target.value })
                  }
                />
                <Group grow></Group>
              </Stack>
            </Card>
          </Grid.Col>

          {/* Data & Storage */}
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Card shadow="sm" radius="md" withBorder>
              <Group mb="md">
                <IconDatabase size={20} color="var(--mantine-color-teal-6)" />
                <Text fw={700}>Data Storage (TSDB)</Text>
              </Group>
              <Stack gap="sm">
                <TextInput
                  label={
                    <Group gap={0}>
                      Storage Path {renderOverride("storage.path")}
                    </Group>
                  }
                  description="Directory where time-series data is persisted"
                  value={config.storage?.path || ""}
                  disabled={!writable || !!overrides["storage.path"]}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      storage: {
                        ...(config.storage || {}),
                        path: e.target.value,
                      },
                    })
                  }
                />
                <Group grow>
                  <TextInput
                    label={
                      <Group gap={0}>
                        Retention {renderOverride("storage.retention")}
                      </Group>
                    }
                    description="Data age limit (e.g. 7d, 30d, 0s for infinity)"
                    value={config.storage?.retention || ""}
                    disabled={!writable || !!overrides["storage.retention"]}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        storage: {
                          ...(config.storage || {}),
                          retention: e.target.value,
                        },
                      })
                    }
                  />
                  <TextInput
                    label={
                      <Group gap={0}>
                        Partition size {renderOverride("storage.partition")}
                      </Group>
                    }
                    description="Database block duration (e.g. 2h)"
                    value={config.storage?.partition || ""}
                    disabled={!writable || !!overrides["storage.partition"]}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        storage: {
                          ...(config.storage || {}),
                          partition: e.target.value,
                        },
                      })
                    }
                  />
                </Group>
                <Divider my="xs" label="Diagnostics" labelPosition="center" />
                <Select
                  label={
                    <Group gap={0}>
                      Default Theme {renderOverride("default-theme")}
                    </Group>
                  }
                  description="Initial UI appearance"
                  data={[
                    { value: "auto", label: "Auto (System)" },
                    { value: "dark", label: "Dark" },
                    { value: "light", label: "Light" },
                  ]}
                  value={config["default-theme"] || "auto"}
                  disabled={!writable || !!overrides["default-theme"]}
                  onChange={(v) => setConfig({ ...config, "default-theme": v })}
                />
                <Select
                  label={
                    <Group gap={0}>
                      Log Level {renderOverride("log-level")}
                    </Group>
                  }
                  description="Console output granularity"
                  data={[
                    { value: "debug", label: "Debug" },
                    { value: "info", label: "Info" },
                    { value: "warn", label: "Warn" },
                    { value: "error", label: "Error" },
                  ]}
                  value={config["log-level"] || "info"}
                  disabled={!writable || !!overrides["log-level"]}
                  onChange={(v) => setConfig({ ...config, "log-level": v })}
                />
              </Stack>
            </Card>
          </Grid.Col>

          {/* Behavior */}
          <Grid.Col span={12}>
            <Card shadow="sm" radius="md" withBorder>
              <Group mb="md">
                <IconSettingsAutomation
                  size={20}
                  color="var(--mantine-color-violet-6)"
                />
                <Text fw={700}>System Behavior</Text>
              </Group>
              <Grid>
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Switch
                    label={
                      <Group gap={0}>
                        Auto-Refresh {renderOverride("auto-refresh")}
                      </Group>
                    }
                    description="Enable live data updates on startup"
                    checked={config["auto-refresh"]}
                    disabled={!writable || !!overrides["auto-refresh"]}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        "auto-refresh": e.currentTarget.checked,
                      })
                    }
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Switch
                    label={
                      <Group gap={0}>
                        Disable Collector {renderOverride("no-collector")}
                      </Group>
                    }
                    description="Stop background data recording"
                    checked={config["no-collector"]}
                    disabled={!writable || !!overrides["no-collector"]}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        "no-collector": e.currentTarget.checked,
                      })
                    }
                  />
                </Grid.Col>
              </Grid>
            </Card>
          </Grid.Col>
        </Grid>

        <Divider
          label="Maintenance & Data Migration"
          labelPosition="center"
          my="md"
        />

        <Grid>
          {/* InfluxDB Import */}
          <Grid.Col span={12}>
            <Card shadow="sm" radius="md" withBorder pos="relative" mih={240}>
              {importStatus?.active && (
                <Overlay
                  color="var(--mantine-color-body)"
                  backgroundOpacity={0.85}
                  blur={2}
                  zIndex={10}
                  radius="md"
                >
                  <Center h="100%">
                    <Stack align="center" gap="xs" style={{ width: "80%" }}>
                      <IconCloudDownload
                        size={40}
                        color="var(--mantine-color-orange-6)"
                      />
                      <Text fw={700} size="lg">
                        Historical Data Migration in Progress
                      </Text>
                      <Text size="xs" c="dimmed" ta="center">
                        {importStatus.message}
                      </Text>
                      <Box w="100%" mt="sm">
                        <Progress
                          value={importStatus.percentage}
                          animated
                          color="orange"
                          size="xl"
                          radius="xl"
                        />
                        <Text ta="center" mt={4} fw={700} size="sm">
                          {Math.round(importStatus.percentage)}%
                        </Text>
                      </Box>
                    </Stack>
                  </Center>
                </Overlay>
              )}
              <Group mb="md" justify="space-between">
                <Group gap="xs">
                  <IconCloudDownload
                    size={20}
                    color="var(--mantine-color-orange-6)"
                  />
                  <Text fw={700}>InfluxDB Historical Import</Text>
                </Group>
                <Group gap="xs">
                  <Button
                    variant="light"
                    color="blue"
                    size="xs"
                    leftSection={<IconPlugConnected size={14} />}
                    loading={testing}
                    onClick={handleTestImport}
                  >
                    Test Connection
                  </Button>
                  <Button
                    variant="filled"
                    color="orange"
                    size="xs"
                    leftSection={<IconCloudDownload size={14} />}
                    loading={importing}
                    onClick={handleRunImport}
                  >
                    Start Import
                  </Button>
                </Group>
              </Group>

              <Grid>
                <Grid.Col span={{ base: 12, md: 3 }}>
                  <TextInput
                    label="InfluxDB Host"
                    placeholder="http://localhost:8086"
                    value={importHost}
                    onChange={(e) => setImportHost(e.target.value)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 2 }}>
                  <TextInput
                    label="Database"
                    placeholder="powerwall"
                    value={importDB}
                    onChange={(e) => setImportDB(e.target.value)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 2 }}>
                  <TextInput
                    label="Username"
                    value={importUser}
                    onChange={(e) => setImportUser(e.target.value)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 2 }}>
                  <PasswordInput
                    label="Password"
                    value={importPass}
                    onChange={(e) => setImportPass(e.target.value)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 3 }}>
                  <DatePickerInput
                    type="range"
                    label="Import Range"
                    placeholder="Select date range"
                    value={importRange}
                    onChange={(val) =>
                      setImportRange(val as [Date | null, Date | null])
                    }
                  />
                </Grid.Col>
              </Grid>

              {!importStatus?.active && (
                <Alert variant="light" color="blue" mt="md">
                  Importing historical data will merge InfluxDB records into
                  your local TSDB database. This process runs in the background
                  and may take several minutes for large date ranges.
                </Alert>
              )}
            </Card>
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
}
