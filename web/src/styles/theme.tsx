import { createTheme, DEFAULT_THEME, mergeMantineTheme } from '@mantine/core';

import { colors } from './colors';
import { components } from './components';
import { other } from './other';
import { shadows } from './shadows';

const themeOverride = createTheme({
  colors,
  components,
  other,
  shadows,
});

export const theme = mergeMantineTheme(DEFAULT_THEME, themeOverride);
