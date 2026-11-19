import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { AppErrorBoundary } from './components/ui/Primitives.tsx';
import './index.css';

// Google Maps Platform Case A (Demo Key Quota Error Defense)
if (typeof window !== 'undefined') {
  (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  };
  const origConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const joined = args.map((a) => String(a)).join(' ');
    if (joined.includes('OverQuotaMapError') || joined.includes('QuotaExceededError')) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
    origConsoleError.apply(console, args);
  };
}

// Register PWA Service Worker safely
registerSW({ immediate: true });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>
);
