import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { CodeHighlightAdapterProvider, createShikiAdapter } from '@mantine/code-highlight';
import App from './App.tsx'

async function loadShiki() {
  const { createHighlighter } = await import('shiki');
  const shiki = await createHighlighter({
    langs: ['tsx', 'scss', 'html', 'bash', 'json', 'yaml'],
    themes: ['github-dark', 'github-light'],
  });

  return shiki;
}

const shikiAdapter = createShikiAdapter(loadShiki);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider>
      <CodeHighlightAdapterProvider adapter={shikiAdapter}>
        <App />
      </CodeHighlightAdapterProvider>
    </MantineProvider>
  </StrictMode>,
)
