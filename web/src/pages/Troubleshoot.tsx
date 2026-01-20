import { Container, Title, Grid, Card, Text, Badge, Group, Stack, Button, Select, Center, ScrollArea, Paper, ActionIcon, Tooltip, CopyButton } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import '@mantine/code-highlight/styles.css';
import { IconTool, IconPlayerPlay, IconBug, IconDownload, IconCheck, IconX, IconSearch, IconCopy, IconDeviceFloppy } from "@tabler/icons-react";
import { useState } from "react";
import { notifications } from "@mantine/notifications";
import classes from "./Troubleshoot.module.scss";

const KNOWN_QUERIES = [
  "SystemConfig",
  "SelfTestQuery",
  "DeviceControllerQuery",
  "DeviceControllerQueryV2",
  "IE2030Query",
  "GridCodesDetailsQuery",
  "ComponentsQuery",
  "GridCodesQuery",
  "WallboxComponentsQuery",
  "ProtectionTripQuery"
];

const COLLECTORS = [
    "ConfigCollector",
    "DeviceCollector",
    "GridCollector",
    "AggregatesCollector",
    "SoeCollector"
];

interface RunResult {
    name: string;
    success: boolean;
    message?: string;
    error?: string;
    duration: string;
    ran: boolean;
}

export default function Troubleshoot() {
  const [runningAll, setRunningAll] = useState(false);
  const [collectorResults, setCollectorResults] = useState<Record<string, RunResult>>(
    COLLECTORS.reduce((acc, name) => ({ ...acc, [name]: { name, success: false, duration: "-", ran: false } }), {})
  );
  
  const [selectedQuery, setSelectedQuery] = useState<string | null>(KNOWN_QUERIES[1]);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<any>(null);
  const [bundling, setBundling] = useState(false);

  const handleForceRun = async (name?: string) => {
    if (!name) setRunningAll(true);
    
    // If individual run, set that specific one to loading state? 
    // We'll just use the button loading state
    
    try {
      const resp = await fetch("/api/v1/collectors/run", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      const data = await resp.json();
      
      if (name) {
          // Update single result
          setCollectorResults(prev => ({ ...prev, [name]: { ...data, ran: true } }));
      } else {
          // Update all results from report
          const newResults: Record<string, RunResult> = {};
          data.results.forEach((res: any) => {
              newResults[res.name] = { ...res, ran: true };
          });
          setCollectorResults(newResults);
      }
      
      notifications.show({ 
          title: name ? `${name} Finished` : "All Collectors Finished", 
          message: "Execution completed successfully", 
          color: "green" 
      });
    } catch (e: any) {
      notifications.show({ title: "Run Failed", message: e.message, color: "red" });
    } finally {
      if (!name) setRunningAll(false);
    }
  };

  const handleRunQuery = async () => {
    if (!selectedQuery) return;
    setQueryLoading(true);
    try {
      const url = selectedQuery === "SystemConfig" ? "/api/v1/config" : "/api/v1/debug/query";
      const options = selectedQuery === "SystemConfig" ? {
        method: "GET"
      } : {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selectedQuery, params: "" })
      };
      
      const resp = await fetch(url, options);
      const data = await resp.json();
      setQueryResult(data);
    } catch (e: any) {
      notifications.show({ title: "Query Failed", message: e.message, color: "red" });
    } finally {
      setQueryLoading(false);
    }
  };

  const saveToFile = () => {
    if (!queryResult || !selectedQuery) return;
    const blob = new Blob([JSON.stringify(queryResult, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedQuery}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const downloadBundle = async () => {
    setBundling(true);
    try {
      const resp = await fetch("/api/v1/debug/bundle");
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `power-dash-diagnostic-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e: any) {
      notifications.show({ title: "Bundle Failed", message: e.message, color: "red" });
    } finally {
      setBundling(false);
    }
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        <Group justify="space-between">
          <Stack gap={0}>
            <Title order={1}>Troubleshooting</Title>
            <Text c="dimmed" size="sm">Diagnostic tools and system recovery</Text>
          </Stack>
          <Button 
            leftSection={<IconDownload size={18} />} 
            variant="filled" 
            color="orange"
            loading={bundling}
            onClick={downloadBundle}
          >
            Download Tech Support Bundle
          </Button>
        </Group>

        <Grid>
          {/* Collector Control */}
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Group justify="space-between" mb="md">
                <Group gap="xs">
                    <IconTool size={20} color="var(--mantine-color-blue-6)" />
                    <Text fw={700}>Collector Status</Text>
                </Group>
                <Button 
                    size="xs" 
                    variant="light" 
                    leftSection={<IconPlayerPlay size={14} />}
                    loading={runningAll}
                    onClick={() => handleForceRun()}
                >
                    Run All
                </Button>
              </Group>
              
              <Stack gap="xs">
                {COLLECTORS.map((name) => {
                    const res = collectorResults[name];
                    return (
                        <Paper key={name} withBorder p="xs" radius="sm">
                            <Group justify="space-between">
                                <Stack gap={0}>
                                    <Group gap="sm">
                                        {res.ran ? (
                                            res.success ? <IconCheck size={16} color="green" /> : <IconX size={16} color="red" />
                                        ) : <IconSearch size={16} color="gray" />}
                                        <Text size="sm" fw={600}>{name}</Text>
                                    </Group>
                                    {res.message && <Text size="xs" c="dimmed" mt={2}>{res.message}</Text>}
                                    {res.error && <Text size="xs" c="red" mt={2} ff="monospace">{res.error}</Text>}
                                    {!res.ran && <Text size="xs" c="dimmed" mt={2} fs="italic">No recent run</Text>}
                                </Stack>
                                <Group gap="xs">
                                    <Badge size="xs" variant="light">{res.duration}</Badge>
                                    <ActionIcon 
                                        variant="subtle" 
                                        color="blue" 
                                        size="sm" 
                                        onClick={() => handleForceRun(name)}
                                        loading={runningAll}
                                    >
                                        <IconPlayerPlay size={14} />
                                    </ActionIcon>
                                </Group>
                            </Group>
                        </Paper>
                    );
                })}
              </Stack>
            </Card>
          </Grid.Col>

          {/* Diagnostic Query */}
          <Grid.Col span={{ base: 12, md: 7 }}>
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Group mb="md" justify="space-between">
                <Group gap="xs">
                    <IconBug size={20} color="var(--mantine-color-red-6)" />
                    <Text fw={700}>Raw API Debugger</Text>
                </Group>
                <Group gap="xs">
                    {queryResult && (
                        <>
                            <CopyButton value={JSON.stringify(queryResult, null, 2)} timeout={2000}>
                                {({ copied, copy }) => (
                                    <Tooltip label={copied ? "Copied" : "Copy JSON"}>
                                        <ActionIcon variant="light" color={copied ? 'teal' : 'blue'} onClick={copy}>
                                            {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                                        </ActionIcon>
                                    </Tooltip>
                                )}
                            </CopyButton>
                            <Tooltip label="Save JSON">
                                <ActionIcon variant="light" color="green" onClick={saveToFile}>
                                    <IconDeviceFloppy size={16} />
                                </ActionIcon>
                            </Tooltip>
                        </>
                    )}
                    <Select 
                        size="xs"
                        placeholder="Select Query"
                        data={KNOWN_QUERIES}
                        value={selectedQuery}
                        onChange={setSelectedQuery}
                        className={classes.querySelect}
                    />
                    <Button 
                        size="xs" 
                        variant="filled" 
                        color="red"
                        leftSection={<IconSearch size={14} />}
                        loading={queryLoading}
                        onClick={handleRunQuery}
                    >
                        Execute
                    </Button>
                </Group>
              </Group>

              <ScrollArea h={400} type="always" offsetScrollbars>
                {queryResult ? (
                    <CodeHighlight 
                        code={JSON.stringify(queryResult, null, 2)} 
                        language="json"
                        withCopyButton={false}
                        className={classes.codeBlock}
                    />
                ) : (
                    <Center h="100%">
                        <Stack align="center" gap={4}>
                            <IconBug size={48} color="var(--mantine-color-gray-3)" />
                            <Text size="sm" c="dimmed">Select a query and click execute to see raw data</Text>
                        </Stack>
                    </Center>
                )}
              </ScrollArea>
            </Card>
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
}