import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { Layout } from './components/layout';
import { AuditEvents } from './pages/audit-events';
import { Cache } from './pages/cache';
import { Certificates } from './pages/certificates';
import { Config } from './pages/config';
import { Dlq } from './pages/dlq';
import { Jobs } from './pages/jobs';
import { MarketData } from './pages/market-data';
import { Services } from './pages/services';
import { TrainingResults } from './pages/training-results';
import { Workers } from './pages/workers';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/services" replace />} />
          <Route path="/services" element={<Services />} />
          <Route path="/certificates" element={<Certificates />} />
          <Route path="/audit/events" element={<AuditEvents />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/broker/dlq" element={<Dlq />} />
          <Route path="/training/results" element={<TrainingResults />} />
          <Route path="/cache" element={<Cache />} />
          <Route path="/workers" element={<Workers />} />
          <Route path="/market-data" element={<MarketData />} />
          <Route path="/config" element={<Config />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
