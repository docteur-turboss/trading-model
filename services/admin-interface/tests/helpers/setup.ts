import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';

import i18n from '../../src/i18n/config';

afterEach(() => {
  cleanup();
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
