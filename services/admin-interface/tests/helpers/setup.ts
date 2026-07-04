import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";

import "../../src/i18n";

afterEach(() => {
	cleanup();
});

class ResizeObserverMock {
	observe() {}
	unobserve() {}
	disconnect() {}
}

globalThis.ResizeObserver =
	ResizeObserverMock as unknown as typeof ResizeObserver;
