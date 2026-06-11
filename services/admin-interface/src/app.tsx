import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout';
import { Services } from './pages/services';
import { Certificates } from './pages/certificates';
import { AuditEvents } from './pages/audit-events';
import { Jobs } from './pages/jobs';
import { Dlq } from './pages/dlq';
import { TrainingResults } from './pages/training-results';
import { Cache } from './pages/cache';
import { Workers } from './pages/workers';
import { MarketData } from './pages/market-data';
import { Config } from './pages/config';

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
