import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { access } from 'fs/promises'
import { join } from 'path'
import { createMockServer, startServer, stopServer } from './helpers/server.js'
import { runCLI, createIsolatedHome, cleanupHome } from './helpers/cli.js'
import type { Server } from 'http'

describe('E2E: Expired Verification Session', () => {
	const PORT = 9878
	let server: Server
	let testHome: string

	beforeAll(async () => {
		server = createMockServer({
			port: PORT,
			routes: {
				'/resources/cli-auth/start': async () => ({
					status: 200,
					body: { sessionId: 'test-session-expired' },
				}),
				'/resources/cli-auth/status': async () => ({
					status: 200,
					body: { status: 'expired' },
				}),
			},
		})
		await startServer(server, PORT)
	})

	afterAll(async () => {
		await stopServer(server)
	})

	beforeEach(async () => {
		testHome = await createIsolatedHome()
	})

	afterEach(async () => {
		await cleanupHome(testHome)
	})

	it('exits with code 1 on expired session and does not create .npmrc', async () => {
		const result = await runCLI({
			env: {
				HOME: testHome,
				LAUNCHFAST_API: `http://localhost:${PORT}`,
				LAUNCHFAST_SKIP_NODE_CHECK: 'true',
				LAUNCHFAST_SKIP_NPM_CHECK: 'true',
				LAUNCHFAST_SKIP_INSTALLER: 'true',
			},
			input: 'user@example.com\n',
			timeout: 10000,
		})

		// Verify non-zero exit code
		expect(result.exitCode).toBe(1)

		// Verify .npmrc was NOT created
		const npmrcPath = join(testHome, '.npmrc')
		await expect(access(npmrcPath)).rejects.toThrow()

		// Verify error message
		expect(result.stderr).toContain('Verification session expired')
	})
})
