import type { ReactNode } from 'react';
import { Text } from '@mantine/core';
import classes from './ChartPanel.module.css';

interface PanelProps {
  title: string;
  children: ReactNode;
  onClick?: () => void;
  rightSection?: ReactNode;
  fixedTimeframe?: boolean;
}

export function Panel({ title, children, onClick, rightSection }: PanelProps) {
  const hasHeader = title || rightSection;
  return (
    <div className={`${classes.panel} ${onClick ? classes.interactive : ''}`} onClick={onClick}>
      {hasHeader && (
        <div className={classes.header}>
          <Text className={classes.title}>{title}</Text>
          {rightSection}
        </div>
      )}
      <div className={classes.content}>
        {children}
      </div>
    </div>
  );
}
