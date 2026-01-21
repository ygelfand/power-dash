import { useState } from "react";
import {
  Container,
  Title,
  Stack,
  TextInput,
  Button,
  Group,
  Table,
  ScrollArea,
  SegmentedControl,
  Text,
  Paper,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { CodeHighlight } from "@mantine/code-highlight";
import "@mantine/dates/styles.css";
import { IconSearch, IconClock } from "@tabler/icons-react";

export function Explorer() {
  const [query, setQuery] = useState("");
  const [evalTime, setEvalTime] = useState<Date | null>(null);
  const [resultData, setResultData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState("table");

  const handleQuery = async () => {
    setLoading(true);
    setError(null);
    try {
      const timeParam = evalTime ? `&time=${evalTime.toISOString()}` : "";
      const res = await fetch(
        `/api/v1/prom/api/v1/query?query=${encodeURIComponent(query)}${timeParam}`,
      );
      const data = await res.json();
      if (data.status === "error") {
        setError(data.error);
        setResultData(null);
      } else {
        setResultData(data);
      }
    } catch (e: any) {
      setError(e.message);
      setResultData(null);
    } finally {
      setLoading(false);
    }
  };

  const formatLabels = (labels: Record<string, string>) => {
    const name = labels["__name__"] || "";
    const rest = Object.entries(labels)
      .filter(([k]) => k !== "__name__")
      .map(([k, v]) => `${k}="${v}"`)
      .join(", ");
    return (
      <Group gap={4} wrap="nowrap">
        <Text fw={700} size="sm">
          {name}
        </Text>
        {rest && (
          <Text c="dimmed" size="xs">
            {`{${rest}}`}
          </Text>
        )}
      </Group>
    );
  };

  const renderContent = () => {
    if (error) {
      return (
        <Paper
          p="md"
          withBorder
          bg="red.0"
          style={{ borderColor: "var(--mantine-color-red-3)" }}
        >
          <Text c="red" fw={700}>
            Query Error
          </Text>
          <Text size="sm" c="red">
            {error}
          </Text>
        </Paper>
      );
    }

    if (!resultData) return null;

    if (viewMode === "raw") {
      return (
        <CodeHighlight
          code={JSON.stringify(resultData, null, 2)}
          language="json"
        />
      );
    }

    const { resultType, result } = resultData.data;

    if (resultType === "vector") {
      return (
        <ScrollArea>
          <Table striped highlightOnHover withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Metric</Table.Th>
                <Table.Th w={120}>Value</Table.Th>
                <Table.Th w={200}>Timestamp</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {result.map((r: any, i: number) => (
                <Table.Tr key={i}>
                  <Table.Td>{formatLabels(r.metric)}</Table.Td>
                  <Table.Td>
                    <Text fw={700}>{r.value[1]}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">
                      {new Date(r.value[0] * 1000).toLocaleString()}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      );
    }

    if (resultType === "matrix") {
      return (
        <ScrollArea>
          <Table striped highlightOnHover withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Metric</Table.Th>
                <Table.Th>Samples</Table.Th>
                <Table.Th>Latest Value</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {result.map((r: any, i: number) => (
                <Table.Tr key={i}>
                  <Table.Td>{formatLabels(r.metric)}</Table.Td>
                  <Table.Td>{r.values.length}</Table.Td>
                  <Table.Td>
                    <Text fw={700}>{r.values[r.values.length - 1][1]}</Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      );
    }

    return <Text c="dimmed">No result to display</Text>;
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={2}>Data Explorer</Title>
          <SegmentedControl
            value={viewMode}
            onChange={setViewMode}
            data={[
              { label: "Table", value: "table" },
              { label: "Raw JSON", value: "raw" },
            ]}
          />
        </Group>

        <Paper p="md" withBorder shadow="xs">
          <Group align="flex-end">
            <TextInput
              label="Query"
              placeholder='power_watts{site="solar"}'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ flexGrow: 1 }}
              onKeyDown={(e) => e.key === "Enter" && handleQuery()}
            />
            <DateTimePicker
              label="Evaluation Time"
              placeholder="Now"
              value={evalTime}
              valueFormat="MM/DD/YYYY HH:mm:ss"
              onChange={(val) => setEvalTime(val ? new Date(val) : null)}
              clearable
              w={200}
              leftSection={<IconClock size={16} />}
            />
            <Button
              onClick={handleQuery}
              loading={loading}
              leftSection={<IconSearch size={16} />}
            >
              Run Query
            </Button>
          </Group>
        </Paper>

        {renderContent()}
      </Stack>
    </Container>
  );
}

