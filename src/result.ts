/**
 * Result type for explicit error handling.
 * Enforces semantic honesty - expected failures are modeled in types, not exceptions.
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

export function ok<T>(value: T): Result<T, never> {
	return { ok: true, value }
}

export function err<E>(error: E): Result<never, E> {
	return { ok: false, error }
}

/**
 * Boundary error types - these represent failures at system boundaries
 * that can legitimately throw and should be caught exactly once.
 */
export type NetworkError = {
	type: 'network'
	message: string
}

export type ParseError = {
	type: 'parse'
	message: string
}

export type BoundaryError = NetworkError | ParseError

export function networkError(message: string): NetworkError {
	return { type: 'network', message }
}

export function parseError(message: string): ParseError {
	return { type: 'parse', message }
}

/**
 * Wraps a boundary call (fetch, JSON parse, etc.) and converts exceptions
 * to explicit error types. This is the ONLY place exceptions should be caught
 * for expected failures.
 */
export async function fetchWithResult(
	input: string | URL,
	init?: RequestInit,
	fetchFn: (input: string | URL, init?: RequestInit) => Promise<Response> = globalThis.fetch,
): Promise<Result<Response, NetworkError>> {
	try {
		const response = await fetchFn(input, init)
		return ok(response)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		return err(networkError(message))
	}
}

export async function parseJsonWithResult<T>(response: Response): Promise<Result<T, ParseError>> {
	try {
		const data = await response.json()
		return ok(data as T)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		return err(parseError(message))
	}
}

/**
 * Checks if an error is retryable. Network errors are typically retryable.
 * Non-retryable errors (like 403 Forbidden) should be handled separately.
 */
export function isRetryableBoundaryError(error: BoundaryError): boolean {
	return error.type === 'network' || error.type === 'parse'
}
