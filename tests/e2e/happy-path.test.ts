import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { createMockServer, startServer, stopServer } from './helpers/server.js'
import { runCLI, createIsolatedHome, cleanupHome } from './helpers/cli.js'
import type { Server } from 'http'

describe('E2E: Happy Path', () => {
	const PORT = 9876
	let server: Server
	let testHome: string
	let pollCount: number

	beforeAll(async () => {
		pollCount = 0
		server = createMockServer({
			port: PORT,
			routes: {
				'/resources/cli-auth/start': async () => ({
					status: 200,
					body: { sessionId: 'test-session-happy' },
				}),
				'/resources/cli-auth/status': async () => {
					pollCount++
					// Simulate pending then verified
					if (pollCount < 3) {
						return { status: 200, body: { status: 'pending' } }
					}
					return {
						status: 200,
						body: { status: 'verified', session: 'test-session-happy' },
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

	it('authenticates successfully', async () => {
		const result = await runCLI({
			env: {
				HOME: testHome,
				LAUNCHFAST_API: `http://localhost:${PORT}`,
				LAUNCHFAST_SKIP_NODE_CHECK: 'true',
				LAUNCHFAST_SKIP_INSTALLER: 'true',
			},
			input: 'user@example.com\n',
			timeout: 10000,
		})

		// Verify exit code 0
		expect(result.exitCode).toBe(0)

		// Verify success message in stdout
		expect(result.stdout).toContain('Authentication successful')
	})
})
