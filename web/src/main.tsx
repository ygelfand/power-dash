import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { CodeHighlightAdapterProvider, createShikiAdapter } from '@mantine/code-highlight';
import App from './App.tsx'
import { theme } from './styles/theme';

async function loadShiki() {
  const { createHighlighterCore } = await import('shiki/core');
  const { createJavaScriptRegexEngine } = await import('shiki/engine/javascript');
  
  const langJson = await import('shiki/langs/json.mjs');
  const themeDark = await import('shiki/themes/github-dark.mjs');
  const themeLight = await import('shiki/themes/github-light.mjs');

  const shiki = await createHighlighterCore({
    themes: [themeDark.default, themeLight.default],
    langs: [langJson.default],
    engine: createJavaScriptRegexEngine(),
  });

  return shiki;
}

const shikiAdapter = createShikiAdapter(loadShiki);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme}>
      <CodeHighlightAdapterProvider adapter={shikiAdapter}>
        <App />
      </CodeHighlightAdapterProvider>
    </MantineProvider>
  </StrictMode>,
)
