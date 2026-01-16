import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Paper, Alert } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <Paper shadow="xs" p="md" withBorder h="100%">
            <Alert variant="light" color="red" title="Panel Error" icon={<IconAlertCircle size={16} />}>
                {this.state.error?.message || "An unexpected error occurred in this panel."}
            </Alert>
        </Paper>
      );
    }

    return this.props.children;
  }
}
