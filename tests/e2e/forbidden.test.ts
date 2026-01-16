import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { access } from 'fs/promises'
import { join } from 'path'
import { createMockServer, startServer, stopServer } from './helpers/server.js'
import { runCLI, createIsolatedHome, cleanupHome } from './helpers/cli.js'
import type { Server } from 'http'

describe('E2E: Forbidden (No Purchase)', () => {
	const PORT = 9877
	let server: Server
	let testHome: string

	beforeAll(async () => {
		server = createMockServer({
			port: PORT,
			routes: {
				'/resources/cli-auth/start': async () => ({
					status: 403,
					body: { error: 'No purchase found for this email' },
				}),
				'/resources/cli-auth/status': async () => ({
					status: 404,
					body: { error: 'Not found' },
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

	it('exits with code 1 and does not create .npmrc', async () => {
		const result = await runCLI({
			env: {
				HOME: testHome,
				LAUNCHFAST_API: `http://localhost:${PORT}`,
				LAUNCHFAST_SKIP_NPM_CHECK: 'true',
				LAUNCHFAST_SKIP_INSTALLER: 'true',
			},
			input: 'nopurchase@example.com\n',
			timeout: 10000,
		})

		// Verify non-zero exit code
		expect(result.exitCode).toBe(1)

		// Verify .npmrc was NOT created (no side effects)
		const npmrcPath = join(testHome, '.npmrc')
		await expect(access(npmrcPath)).rejects.toThrow()

		// Verify error message
		expect(result.stderr).toContain('No purchase found')
	})
})
