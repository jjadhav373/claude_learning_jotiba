/** Production entry: the WhatsApp button opens https://<host>/c/<token>. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/app.css';
import { createHttpApi, tokenFromLocation } from './api/http';
import { FlowProvider } from './state/flow';
import { CustomerFlow } from './App';

const token = tokenFromLocation();
const api = createHttpApi(import.meta.env.VITE_API_URL ?? '', token ?? '');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FlowProvider api={api}>
      <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: 'var(--surface)' }}>
        <CustomerFlow />
      </div>
    </FlowProvider>
  </StrictMode>,
);
