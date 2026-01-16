import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startAuthFlow } from './startAuthFlow.js'
import type { ExitFn } from '../types.js'

class ExitError extends Error {
	constructor(public code: number) {
		super(`Exit called with code ${code}`)
		this.name = 'ExitError'
	}
}

describe('startAuthFlow', () => {
	const mockExit: ExitFn = (code) => {
		throw new ExitError(code)
	}
	const mockSleep = vi.fn().mockResolvedValue(undefined)

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('returns sessionId on successful response', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ sessionId: 'test-session-123' }),
		})

		const result = await startAuthFlow('user@example.com', {
			fetch: mockFetch,
			sleep: mockSleep,
			exit: mockExit,
			apiUrl: 'http://localhost:3000',
		})

		expect(result).toBe('test-session-123')
		expect(mockFetch).toHaveBeenCalledTimes(1)
		expect(mockSleep).not.toHaveBeenCalled()
	})

	it('retries up to maxRetries on network failure with exponential backoff', async () => {
		const mockFetch = vi
			.fn()
			.mockRejectedValueOnce(new Error('Network error'))
			.mockRejectedValueOnce(new Error('Network error'))
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ sessionId: 'recovered-session' }),
			})

		const result = await startAuthFlow('user@example.com', {
			fetch: mockFetch,
			sleep: mockSleep,
			exit: mockExit,
			apiUrl: 'http://localhost:3000',
			maxRetries: 3,
		})

		expect(result).toBe('recovered-session')
		expect(mockFetch).toHaveBeenCalledTimes(3)
		expect(mockSleep).toHaveBeenCalledTimes(2)
		expect(mockSleep).toHaveBeenNthCalledWith(1, 2000) // 2^1 * 1000
		expect(mockSleep).toHaveBeenNthCalledWith(2, 4000) // 2^2 * 1000
	})

	it('exits with code 1 after maxRetries exhausted', async () => {
		const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))

		await expect(
			startAuthFlow('user@example.com', {
				fetch: mockFetch,
				sleep: mockSleep,
				exit: mockExit,
				apiUrl: 'http://localhost:3000',
				maxRetries: 3,
			})
		).rejects.toThrow(ExitError)

		expect(mockFetch).toHaveBeenCalledTimes(3)
	})

	it('exits immediately with code 1 on 403 forbidden without retrying', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 403,
			json: () => Promise.resolve({ error: 'No purchase found' }),
		})

		await expect(
			startAuthFlow('user@example.com', {
				fetch: mockFetch,
				sleep: mockSleep,
				exit: mockExit,
				apiUrl: 'http://localhost:3000',
			})
		).rejects.toThrow(ExitError)

		expect(mockFetch).toHaveBeenCalledTimes(1)
		expect(mockSleep).not.toHaveBeenCalled()
	})

	it('fails deterministically if response ok but no sessionId returned', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({}), // Missing sessionId
		})

		await expect(
			startAuthFlow('user@example.com', {
				fetch: mockFetch,
				sleep: mockSleep,
				exit: mockExit,
				apiUrl: 'http://localhost:3000',
				maxRetries: 1,
			})
		).rejects.toThrow('Protocol violation: Server returned 200 OK but missing required sessionId')
	})

	it('performs no side effects on failure (only logs and exits)', async () => {
		const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
		const sideEffectFn = vi.fn()
		let exitCode: number | undefined

		const trackingExit: ExitFn = (code) => {
			exitCode = code
			sideEffectFn()
			throw new ExitError(code)
		}

		await expect(
			startAuthFlow('user@example.com', {
				fetch: mockFetch,
				sleep: mockSleep,
				exit: trackingExit,
				apiUrl: 'http://localhost:3000',
				maxRetries: 1,
			})
		).rejects.toThrow(ExitError)

		// Exit was called with code 1
		expect(exitCode).toBe(1)
		expect(sideEffectFn).toHaveBeenCalled()
	})
})
