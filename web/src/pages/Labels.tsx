import {
  Container,
  Title,
  Text,
  Badge,
  Group,
  Stack,
  TextInput,
  Button,
  Alert,
  Loader,
  Center,
  ActionIcon,
  Card,
  Divider,
  Box,
} from "@mantine/core";
import {
  IconDeviceFloppy,
  IconLock,
  IconLockOpen,
  IconAlertCircle,
  IconPlus,
  IconTrash,
  IconTags,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { notifications } from "@mantine/notifications";
import { useLabels } from "../contexts/LabelContext";

export function Labels() {
  const { refresh, loading: contextLoading } = useLabels();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [writable, setWritable] = useState(false);
  const [localLabels, setLocalLabels] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    fetchLabels();
  }, []);

  const fetchLabels = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/labels");
      const data = await res.json();
      setLocalLabels(data.config.global || {});
      setWritable(data.writable);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setLocalLabels({ ...localLabels, "": "" });
    setIsDirty(true);
  };

  const handleUpdateKey = (oldKey: string, newKey: string) => {
    const newLabels = { ...localLabels };
    const value = newLabels[oldKey];
    delete newLabels[oldKey];
    newLabels[newKey] = value;
    setLocalLabels(newLabels);
    setIsDirty(true);
  };

  const handleUpdateValue = (key: string, value: string) => {
    setLocalLabels({ ...localLabels, [key]: value });
    setIsDirty(true);
  };

  const handleDelete = (key: string) => {
    const newLabels = { ...localLabels };
    delete newLabels[key];
    setLocalLabels(newLabels);
    setIsDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const cleanLabels: Record<string, string> = {};
      Object.entries(localLabels).forEach(([k, v]) => {
        if (k.trim()) cleanLabels[k.trim()] = v.trim();
      });

      const resp = await fetch("/api/v1/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ global: cleanLabels }),
      });
      if (resp.ok) {
        notifications.show({
          title: "Labels Saved",
          message: "Global label mappings updated successfully.",
          color: "green",
        });
        await refresh();
        setIsDirty(false);
        // Re-fetch to ensure local state is perfectly synced with server (ordering, etc)
        fetchLabels();
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

  if (loading || contextLoading)
    return (
      <Center h="80vh">
        <Loader size="xl" />
      </Center>
    );

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        <Group justify="space-between" align="flex-start">
          <Stack gap={0}>
            <Title order={1}>Label Mappings</Title>
            <Text c="dimmed" size="sm">
              Custom names for metrics and series (e.g., "String 0 A" → "South
              Roof")
            </Text>
          </Stack>
          <Group>
            {writable ? (
              <Badge
                color="green"
                variant="light"
                leftSection={<IconLockOpen size={14} />}
              >
                Writable
              </Badge>
            ) : (
              <Badge
                color="orange"
                variant="light"
                leftSection={<IconLock size={14} />}
              >
                Read-Only
              </Badge>
            )}
            <Button
              leftSection={<IconDeviceFloppy size={18} />}
              disabled={!writable || !isDirty}
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
            title="Read-Only Mode"
            icon={<IconAlertCircle />}
          >
            The labels configuration file is not writable. You can view existing
            mappings but cannot modify them here.
          </Alert>
        )}

        <Card shadow="sm" radius="md" withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Group gap="xs">
                <IconTags size={20} color="var(--mantine-color-blue-6)" />
                <Text fw={700}>Global Mappings</Text>
              </Group>
              <Button
                variant="light"
                size="xs"
                leftSection={<IconPlus size={14} />}
                onClick={handleAdd}
                disabled={!writable}
              >
                Add Mapping
              </Button>
            </Group>

            <Divider />

            {Object.entries(localLabels).length === 0 ? (
              <Center py="xl">
                <Text c="dimmed" size="sm">
                  No label mappings configured yet.
                </Text>
              </Center>
            ) : (
              <Stack gap="xs">
                <Group grow preventGrowOverflow={false} wrap="nowrap">
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                    Original Label
                  </Text>
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                    Custom Name
                  </Text>
                  <Box w={40} />
                </Group>
                {Object.entries(localLabels).map(([key, value], index) => (
                  <Group
                    key={`${key}-${index}`}
                    grow
                    preventGrowOverflow={false}
                    wrap="nowrap"
                  >
                    <TextInput
                      placeholder="Original series name"
                      value={key}
                      disabled={!writable}
                      onChange={(e) => handleUpdateKey(key, e.target.value)}
                    />
                    <TextInput
                      placeholder="Display name"
                      value={value}
                      disabled={!writable}
                      onChange={(e) => handleUpdateValue(key, e.target.value)}
                    />
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      onClick={() => handleDelete(key)}
                      disabled={!writable}
                    >
                      <IconTrash size={18} />
                    </ActionIcon>
                  </Group>
                ))}
              </Stack>
            )}
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
