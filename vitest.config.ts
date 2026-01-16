import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		globals: false,
		environment: 'node',
		include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
		testTimeout: 30000,
		pool: 'threads',
	},
})
