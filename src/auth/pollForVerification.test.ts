import { describe, it, expect, vi, beforeEach } from 'vitest'
import { pollForVerification } from './pollForVerification.js'
import type { ExitFn } from '../types.js'

class ExitError extends Error {
	constructor(public code: number) {
		super(`Exit called with code ${code}`)
		this.name = 'ExitError'
	}
}

describe('pollForVerification', () => {
	const mockExit: ExitFn = (code) => {
		throw new ExitError(code)
	}
	const mockSleep = vi.fn().mockResolvedValue(undefined)

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('returns session immediately when status is verified', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ status: 'verified', session: 'session-123' }),
		})

		const result = await pollForVerification('session-123', {
			fetch: mockFetch,
			sleep: mockSleep,
			exit: mockExit,
			apiUrl: 'http://localhost:3000',
		})

		expect(result).toBe('session-123')
		expect(mockFetch).toHaveBeenCalledTimes(1)
	})

	it('continues polling while status is pending', async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ status: 'pending' }),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ status: 'pending' }),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ status: 'verified', session: 'session-after-pending' }),
			})

		const result = await pollForVerification('session-123', {
			fetch: mockFetch,
			sleep: mockSleep,
			exit: mockExit,
			apiUrl: 'http://localhost:3000',
			pollIntervalMs: 100,
		})

		expect(result).toBe('session-after-pending')
		expect(mockFetch).toHaveBeenCalledTimes(3)
		expect(mockSleep).toHaveBeenCalledTimes(2)
	})

	it('exits with code 1 when status is expired', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ status: 'expired' }),
		})

		await expect(
			pollForVerification('session-123', {
				fetch: mockFetch,
				sleep: mockSleep,
				exit: mockExit,
				apiUrl: 'http://localhost:3000',
			})
		).rejects.toThrow(ExitError)
	})

	it('fails hard if verified without session', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ status: 'verified' }), // Missing session
		})

		await expect(
			pollForVerification('session-123', {
				fetch: mockFetch,
				sleep: mockSleep,
				exit: mockExit,
				apiUrl: 'http://localhost:3000',
			})
		).rejects.toThrow('No session returned after verification')
	})

	it('times out after pollTimeoutMs', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ status: 'pending' }),
		})

		// Mock time to control exactly when timeout occurs
		let currentTime = 0
		const mockNow = vi.fn().mockImplementation(() => {
			currentTime += 50 // Advance 50ms on each call
			return currentTime
		})

		await expect(
			pollForVerification('session-123', {
				fetch: mockFetch,
				sleep: mockSleep,
				exit: mockExit,
				now: mockNow,
				apiUrl: 'http://localhost:3000',
				pollIntervalMs: 10,
				pollTimeoutMs: 100, // Will timeout after ~2 polls (100/50)
			})
		).rejects.toThrow(ExitError)

		expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(1)
	})

	it('handles network errors gracefully and continues polling', async () => {
		const mockFetch = vi
			.fn()
			.mockRejectedValueOnce(new Error('Network error'))
			.mockRejectedValueOnce(new Error('Network error'))
			.mockRejectedValueOnce(new Error('Network error'))
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ status: 'verified', session: 'recovered-session' }),
			})

		const result = await pollForVerification('session-123', {
			fetch: mockFetch,
			sleep: mockSleep,
			exit: mockExit,
			apiUrl: 'http://localhost:3000',
			pollIntervalMs: 10,
			pollTimeoutMs: 10000,
		})

		expect(result).toBe('recovered-session')
		expect(mockFetch).toHaveBeenCalledTimes(4)
	})

	it('does not continue polling after termination (verified)', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ status: 'verified', session: 'session-123' }),
		})

		await pollForVerification('session-123', {
			fetch: mockFetch,
			sleep: mockSleep,
			exit: mockExit,
			apiUrl: 'http://localhost:3000',
		})

		// Only one fetch call, no continued polling
		expect(mockFetch).toHaveBeenCalledTimes(1)
		expect(mockSleep).not.toHaveBeenCalled()
	})
})
