import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { createMockServer, startServer, stopServer } from './helpers/server.js'
import { runCLI, createIsolatedHome, cleanupHome } from './helpers/cli.js'
import type { Server } from 'http'

describe('E2E: Network Instability During Polling', () => {
	const PORT = 9879
	let server: Server
	let testHome: string
	let pollCount: number

	beforeAll(async () => {
		server = createMockServer({
			port: PORT,
			routes: {
				'/resources/cli-auth/start': async () => ({
					status: 200,
					body: { sessionId: 'test-session-network' },
				}),
				'/resources/cli-auth/status': async () => {
					pollCount++
					// Simulate transient errors for first 5 requests, then succeed
					// Need at least 3 consecutive errors to trigger warning message
					// Throwing simulates network failure; on some platforms this becomes HTTP 500
					if (pollCount <= 5) {
						throw new Error('Simulated transient failure')
					}
					return {
						status: 200,
						body: { status: 'verified', token: 'npm-token-after-network-issues' },
					}
				},
			},
		})
		await startServer(server, PORT)
	})

	afterAll(async () => {
		await stopServer(server)
	})

	beforeEach(async () => {
		testHome = await createIsolatedHome()
		pollCount = 0
	})

	afterEach(async () => {
		await cleanupHome(testHome)
	})

	it('recovers from network instability and completes authentication', async () => {
		const result = await runCLI({
			env: {
				HOME: testHome,
				LAUNCHFAST_API: `http://localhost:${PORT}`,
				LAUNCHFAST_SKIP_NODE_CHECK: 'true',
				LAUNCHFAST_SKIP_NPM_CHECK: 'true',
				LAUNCHFAST_SKIP_INSTALLER: 'true',
			},
			input: 'user@example.com\n',
			timeout: 30000,
		})

		// Verify exit code 0 (eventual success)
		expect(result.exitCode).toBe(0)

		// Verify .npmrc was created with token
		const npmrcPath = join(testHome, '.npmrc')
		const npmrcContent = await readFile(npmrcPath, 'utf-8')
		expect(npmrcContent).toContain('//registry.npmjs.org/:_authToken=npm-token-after-network-issues')

		// Verify transient error warning was shown (either network or server error)
		const hasTransientErrorMessage =
			result.stdout.includes('Network unstable') || result.stdout.includes('Server error (500)')
		expect(hasTransientErrorMessage).toBe(true)
		expect(result.stdout).toContain('Connection restored')
	})
})
