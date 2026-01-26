import { spawn } from 'child_process'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

export interface CLIResult {
	stdout: string
	stderr: string
	exitCode: number
}

export interface CLIOptions {
	env?: Record<string, string>
	input?: string
	timeout?: number
}

export async function runCLI(options: CLIOptions = {}): Promise<CLIResult> {
	const cliPath = join(process.cwd(), 'tests', 'e2e', 'helpers', 'run-cli.js')
	const timeout = options.timeout ?? 30000

	return new Promise((resolve, reject) => {
		const proc = spawn('node', [cliPath], {
			env: {
				...process.env,
				// Skip fly CLI check in E2E tests (tests focus on auth flow, not fly installation)
				LAUNCHFAST_SKIP_FLY_CHECK: 'true',
				...options.env,
			},
			stdio: ['pipe', 'pipe', 'pipe'],
		})

		let stdout = ''
		let stderr = ''
		let inputWritten = false

		proc.stdout.on('data', (data) => {
			stdout += data.toString()
			// Write input when we see the email prompt
			if (options.input && !inputWritten && stdout.includes('Enter your LaunchFast purchase email:')) {
				inputWritten = true
				proc.stdin.write(options.input)
				proc.stdin.end()
			}
		})

		proc.stderr.on('data', (data) => {
			stderr += data.toString()
		})

		const timeoutId = setTimeout(() => {
			proc.kill('SIGKILL')
			reject(new Error(`CLI timed out after ${timeout}ms`))
		}, timeout)

		proc.on('close', (code) => {
			clearTimeout(timeoutId)
			resolve({
				stdout,
				stderr,
				exitCode: code ?? 1,
			})
		})

		proc.on('error', (err) => {
			clearTimeout(timeoutId)
			reject(err)
		})
	})
}

export async function createIsolatedHome(): Promise<string> {
	return mkdtemp(join(tmpdir(), 'launchfast-test-'))
}

export async function cleanupHome(path: string): Promise<void> {
	await rm(path, { recursive: true, force: true })
}
