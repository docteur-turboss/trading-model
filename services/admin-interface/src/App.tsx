import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Services } from './pages/Services';
import { Certificates } from './pages/Certificates';
import { AuditEvents } from './pages/AuditEvents';
import { Jobs } from './pages/Jobs';
import { Dlq } from './pages/Dlq';
import { TrainingResults } from './pages/TrainingResults';
import { Cache } from './pages/Cache';
import { Workers } from './pages/Workers';
import { MarketData } from './pages/MarketData';
import { Config } from './pages/Config';

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
