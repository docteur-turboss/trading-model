import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@trading-model/validation": path.resolve(
				__dirname,
				"../../packages/validation/src"
			),
			"@trading-model/common": path.resolve(
				__dirname,
				"../../packages/common/src"
			),
		},
	},
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./tests/helpers/setup.ts"],
		include: ["tests/**/*.spec.{ts,tsx}"],
		maxWorkers: 10,
		coverage: {
			provider: "v8",
			include: ["src/**/*.{ts,tsx}"],
			exclude: ["src/vite-env.d.ts", "src/main.tsx"],
			thresholds: {
				statements: 80,
				branches: 80,
				functions: 80,
				lines: 80,
			},
		},
	},
});
