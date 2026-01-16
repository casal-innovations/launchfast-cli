import { z } from 'zod'
import type { FetchFn, SleepFn, ExitFn } from '../types.js'
import { type Result, ok, err } from '../result.js'

const AuthStartResponseSchema = z.object({
	sessionId: z.string().optional(),
	error: z.string().optional(),
})


/**
 * Expected domain failures - these are legitimate outcomes in the problem space.
 * The system is working correctly; the world just didn't cooperate.
 */
type AuthFlowFailure =
	| { type: 'forbidden'; message: string }
	| { type: 'server_error'; message: string; retryable: true }
	| { type: 'transport'; message: string; retryable: true }

/**
 * System-level violations - these indicate broken invariants or contracts.
 * The system itself is malfunctioning; crash loudly and escalate to humans.
 */
type SystemViolation = { type: 'protocol_violation'; message: string }

/**
 * All possible error outcomes from an auth attempt.
 * Discriminated by behavioral response: failures are handled, violations crash.
 */
type AuthFlowError = AuthFlowFailure | SystemViolation

export type StartAuthFlowDeps = {
	fetch: FetchFn
	sleep: SleepFn
	exit: ExitFn
	apiUrl: string
	maxRetries: number
}

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const defaultExit: ExitFn = (code) => process.exit(code)

function getDefaultDeps(): StartAuthFlowDeps {
	return {
		fetch: globalThis.fetch,
		sleep: defaultSleep,
		exit: defaultExit,
		apiUrl: process.env.LAUNCHFAST_API ?? 'https://launchfast.pro',
		maxRetries: 3,
	}
}

/**
 * Performs a single auth request and classifies the result.
 * Boundary exceptions are caught exactly once here and converted to explicit errors.
 */
async function attemptAuthRequest(
	email: string,
	apiUrl: string,
	fetchFn: FetchFn,
): Promise<Result<string, AuthFlowError>> {
	// Transport boundary - network request can fail
	let response: Response
	try {
		response = await fetchFn(`${apiUrl}/resources/cli-auth/start`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email }),
		})
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		return err({ type: 'transport', message, retryable: true })
	}

	// Transport boundary - response body read can fail
	let rawData: unknown
	try {
		rawData = await response.json()
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (response.ok) {
			// Server returned 2xx but sent non-JSON - this is a protocol violation
			// The contract says success responses must be JSON
			return err({ type: 'protocol_violation', message: `Response is not valid JSON: ${message}` })
		}
		// Non-2xx with non-JSON body (e.g., HTML error page from proxy, Cloudflare, load balancer)
		// We didn't meaningfully reach our server - treat as transport failure
		return err({ type: 'transport', message: `Server returned ${response.status} with non-JSON body`, retryable: true })
	}

	// Domain logic - parse and validate
	const parseResult = AuthStartResponseSchema.safeParse(rawData)
	if (!parseResult.success) {
		// Schema mismatch is a protocol violation - incompatible versions or broken contract
		// This must not be retried; it signals a real problem that needs human attention
		return err({ type: 'protocol_violation', message: `Invalid response schema: ${parseResult.error.message}` })
	}
	const { data } = parseResult

	// Domain logic - classify HTTP response (no exceptions)
	if (!response.ok) {
		if (response.status === 403) {
			// Non-retryable: user not authorized
			return err({ type: 'forbidden', message: data.error ?? 'No purchase found for this email' })
		}
		// Other HTTP errors are retryable
		return err({ type: 'server_error', message: data.error ?? 'Authentication failed', retryable: true })
	}

	// Contract: successful auth start MUST return a sessionId
	if (!data.sessionId) {
		return err({ type: 'protocol_violation', message: 'Server returned 200 OK but missing required sessionId' })
	}

	return ok(data.sessionId)
}

/**
 * Determines if an error should trigger a retry.
 */
function isRetryable(error: AuthFlowError): boolean {
	return 'retryable' in error && error.retryable === true
}

/**
 * Calculate exponential backoff delay.
 */
function getBackoffDelay(attempt: number): number {
	return Math.pow(2, attempt) * 1000
}

export async function startAuthFlow(email: string, deps: Partial<StartAuthFlowDeps> = {}): Promise<string> {
	const { fetch, sleep, exit, apiUrl, maxRetries } = { ...getDefaultDeps(), ...deps }

	let lastError: AuthFlowError | undefined

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		const result = await attemptAuthRequest(email, apiUrl, fetch)

		if (result.ok) {
			return result.value
		}

		const { error } = result
		lastError = error

		// Handle non-retryable errors immediately
		if (!isRetryable(error)) {
			if (error.type === 'forbidden') {
				console.error(`\n${error.message}\n`)
				console.error('What you can do:')
				console.error('  - Verify you are using the email from your LaunchFast purchase')
				console.error('  - Check for typos in the email address')
				console.error('\nIf this persists, contact support@launchfast.pro')
				return exit(1)
			}
			if (error.type === 'protocol_violation') {
				// Crash loudly - this is a broken contract that needs developer attention
				throw new Error(`Protocol violation: ${error.message}`)
			}
			// Invariant breach - if we reach here, the type system has a gap
			throw new Error(`Invariant breach: unhandled non-retryable error type: ${JSON.stringify(error)}`)
		}

		// Retryable error - apply backoff and retry
		if (attempt < maxRetries) {
			const delay = getBackoffDelay(attempt)
			console.log(`Retry ${attempt}/${maxRetries} in ${delay / 1000}s...`)
			await sleep(delay)
		}
	}

	// All retries exhausted - provide accurate messaging based on failure type
	if (!lastError) {
		// Should not reach here - invariant breach
		throw new Error('Invariant breach: retry loop exited without error')
	}

	console.error('')
	if (lastError.type === 'transport') {
		console.error('Could not reach the authentication server.\n')
		console.error('What you can do:')
		console.error('  - Check your internet connection')
		console.error('  - Retry in a few minutes')
	} else if (lastError.type === 'server_error') {
		console.error('Authentication server returned an error.\n')
		console.error('What you can do:')
		console.error('  - Retry in a few minutes')
		console.error('  - The server may be experiencing issues')
	} else {
		// Invariant breach - retryable errors should be one of the above
		throw new Error(`Invariant breach: unexpected retryable error type after exhaustion: ${JSON.stringify(lastError)}`)
	}

	console.error('\nIf this persists, contact support@launchfast.pro')
	const technicalDetails = 'message' in lastError ? lastError.message : 'No session ID returned'
	console.error(`\nTechnical details: ${technicalDetails}`)
	return exit(1)
}
