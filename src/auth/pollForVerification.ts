import type { FetchFn, SleepFn, ExitFn } from '../types.js'
import { type Result, type BoundaryError, ok, err, networkError, parseError } from '../result.js'

type AuthStatusResponse = {
	status: 'pending' | 'verified' | 'expired'
	token?: string
	error?: string
}

/**
 * Domain-specific result types for poll operation.
 * These model all expected outcomes explicitly.
 */
type PollResult =
	| { type: 'verified'; token: string }
	| { type: 'expired' }
	| { type: 'pending' }
	| { type: 'boundary_error'; error: BoundaryError }
	| { type: 'http_error'; status: number }
	| { type: 'invariant_violation'; message: string }

export interface PollForVerificationDeps {
	fetch: FetchFn
	sleep: SleepFn
	exit: ExitFn
	now: () => number
	apiUrl: string
	pollIntervalMs: number
	pollTimeoutMs: number
}

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const defaultExit: ExitFn = (code) => process.exit(code)

function getDefaultDeps(): PollForVerificationDeps {
	return {
		fetch: globalThis.fetch,
		sleep: defaultSleep,
		exit: defaultExit,
		now: () => Date.now(),
		apiUrl: process.env.LAUNCHFAST_API ?? 'https://launchfast.pro',
		pollIntervalMs: 3000,
		pollTimeoutMs: 10 * 60 * 1000,
	}
}

/**
 * Performs a single poll request and classifies the result.
 * Boundary exceptions are caught exactly once here and converted to explicit results.
 */
async function attemptPoll(
	sessionId: string,
	apiUrl: string,
	fetchFn: FetchFn,
): Promise<PollResult> {
	// Boundary call - wrap fetch in try/catch exactly once
	let response: Response
	try {
		response = await fetchFn(`${apiUrl}/resources/cli-auth/status?session=${encodeURIComponent(sessionId)}`)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		return { type: 'boundary_error', error: networkError(message) }
	}

	// Boundary call - wrap JSON parse in try/catch exactly once
	let data: AuthStatusResponse
	try {
		data = (await response.json()) as AuthStatusResponse
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		return { type: 'boundary_error', error: parseError(message) }
	}

	// Domain logic - classify HTTP response (no exceptions)
	if (!response.ok) {
		return { type: 'http_error', status: response.status }
	}

	// Domain logic - classify status (no exceptions)
	if (data.status === 'verified') {
		if (!data.token) {
			// Invariant violation: verified status must have token
			return { type: 'invariant_violation', message: 'No token returned after verification' }
		}
		return { type: 'verified', token: data.token }
	}

	if (data.status === 'expired') {
		return { type: 'expired' }
	}

	return { type: 'pending' }
}

/**
 * Determines if a poll result represents a transient/retryable failure.
 */
function isTransientFailure(result: PollResult): boolean {
	return result.type === 'boundary_error' || result.type === 'http_error'
}

/**
 * Returns an appropriate error message for transient failures.
 */
function getTransientErrorMessage(result: PollResult): string {
	if (result.type === 'boundary_error') {
		return 'Network unstable — retrying...'
	}
	if (result.type === 'http_error') {
		return `Server error (${result.status}) — retrying...`
	}
	return 'Temporary error — retrying...'
}

export async function pollForVerification(sessionId: string, deps: Partial<PollForVerificationDeps> = {}): Promise<string> {
	const { fetch, sleep, exit, now, apiUrl, pollIntervalMs, pollTimeoutMs } = { ...getDefaultDeps(), ...deps }

	const startTime = now()
	let consecutiveErrors = 0
	let hasShownNetworkWarning = false
	let previousStatus: 'pending' | 'verified' | 'expired' | null = null

	while (now() - startTime < pollTimeoutMs) {
		const result = await attemptPoll(sessionId, apiUrl, fetch)

		// Handle transient failures with soft retry
		if (isTransientFailure(result)) {
			consecutiveErrors++

			// Show soft warning after 3 consecutive errors
			if (consecutiveErrors >= 3 && !hasShownNetworkWarning) {
				console.log('\n' + getTransientErrorMessage(result))
				hasShownNetworkWarning = true
			}

			await sleep(pollIntervalMs)
			continue
		}

		// Reset error counter after successful request
		consecutiveErrors = 0
		if (hasShownNetworkWarning) {
			console.log('Connection restored.')
			hasShownNetworkWarning = false
		}

		// Handle terminal states
		if (result.type === 'verified') {
			// Show transition feedback
			if (previousStatus === 'pending') {
				console.log('Verification link opened — finalizing access...')
			}
			return result.token
		}

		if (result.type === 'expired') {
			console.error('\nVerification session expired.\n')
			console.error('What you can do:')
			console.error('  - Run the command again to start a new session')
			console.error('  - Check your spam folder for the verification email')
			console.error('\nIf this persists, contact support@launchfast.pro')
			return exit(1)
		}

		if (result.type === 'invariant_violation') {
			// This is a bug - crash loudly
			throw new Error(result.message)
		}

		// Still pending, continue polling
		previousStatus = 'pending'
		process.stdout.write('.')
		await sleep(pollIntervalMs)
	}

	console.error('\n\nVerification timed out.\n')
	console.error('What you can do:')
	console.error('  - Run the command again to start a new session')
	console.error('  - Check your email (including spam folder)')
	console.error('\nIf this persists, contact support@launchfast.pro')
	return exit(1)
}
