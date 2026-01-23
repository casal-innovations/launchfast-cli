import { describe, it, expect, vi, afterEach } from 'vitest'
import { downloadInstaller } from './downloadInstaller.js'
import type { FetchFn } from '../types.js'

// Mock tar module
vi.mock('tar', () => ({
	extract: vi.fn().mockResolvedValue(undefined),
}))

// Mock fs/promises
vi.mock('fs/promises', () => ({
	mkdir: vi.fn().mockResolvedValue(undefined),
	rm: vi.fn().mockResolvedValue(undefined),
	writeFile: vi.fn().mockResolvedValue(undefined),
}))

describe('downloadInstaller', () => {
	afterEach(() => {
		vi.clearAllMocks()
	})

	it('returns success with installer path when download succeeds', async () => {
		const tarballContent = 'test-tarball-content'
		// Create a clean ArrayBuffer with exact content
		const encoder = new TextEncoder()
		const uint8Array = encoder.encode(tarballContent)
		const arrayBuffer = uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength)
		// SHA256 of 'test-tarball-content'
		const checksum = 'cefad0ed96e1fe2ce7b7397558f8c157d91f76a86c89a3ce17cdf884ebea2183'

		const mockHeaders = {
			get: (name: string) => {
				if (name === 'X-Checksum-SHA256') return checksum
				if (name === 'X-Package-Version') return '1.0.0'
				return null
			},
		}

		const mockFetch: FetchFn = vi.fn().mockResolvedValue({
			ok: true,
			headers: mockHeaders,
			arrayBuffer: () => Promise.resolve(arrayBuffer),
		} as unknown as Response)

		const result = await downloadInstaller('session-123', 'stable', {
			fetch: mockFetch,
			apiUrl: 'http://localhost:3000',
		})

		expect(result.type).toBe('success')
		if (result.type === 'success') {
			expect(result.version).toBe('1.0.0')
			expect(result.installerPath).toContain('launchfast-installer')
		}
	})

	it('returns auth_error for 403 response', async () => {
		const mockFetch: FetchFn = vi.fn().mockResolvedValue({
			ok: false,
			status: 403,
			json: () => Promise.resolve({ error: 'Session not verified' }),
		} as unknown as Response)

		const result = await downloadInstaller('session-123', 'stable', {
			fetch: mockFetch,
			apiUrl: 'http://localhost:3000',
		})

		expect(result.type).toBe('auth_error')
		if (result.type === 'auth_error') {
			expect(result.message).toBe('Session not verified')
		}
	})

	it('returns not_found for 404 response', async () => {
		const mockFetch: FetchFn = vi.fn().mockResolvedValue({
			ok: false,
			status: 404,
			json: () => Promise.resolve({ error: 'No active installer package available' }),
		} as unknown as Response)

		const result = await downloadInstaller('session-123', 'stable', {
			fetch: mockFetch,
			apiUrl: 'http://localhost:3000',
		})

		expect(result.type).toBe('not_found')
		if (result.type === 'not_found') {
			expect(result.message).toBe('No active installer package available')
		}
	})

	it('returns boundary_error for network failures', async () => {
		const mockFetch: FetchFn = vi.fn().mockRejectedValue(new Error('Network error'))

		const result = await downloadInstaller('session-123', 'stable', {
			fetch: mockFetch,
			apiUrl: 'http://localhost:3000',
		})

		expect(result.type).toBe('boundary_error')
		if (result.type === 'boundary_error') {
			expect(result.error.message).toBe('Network error')
		}
	})

	it('returns boundary_error when checksum header is missing', async () => {
		const mockHeaders = {
			get: (name: string) => {
				if (name === 'X-Package-Version') return '1.0.0'
				return null
			},
		}

		const mockFetch: FetchFn = vi.fn().mockResolvedValue({
			ok: true,
			headers: mockHeaders,
			arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
		} as unknown as Response)

		const result = await downloadInstaller('session-123', 'stable', {
			fetch: mockFetch,
			apiUrl: 'http://localhost:3000',
		})

		expect(result.type).toBe('boundary_error')
		if (result.type === 'boundary_error') {
			expect(result.error.message).toBe('Missing checksum header')
		}
	})

	it('returns checksum_mismatch when checksum does not match', async () => {
		const tarballContent = 'test-tarball-content'
		const encoder = new TextEncoder()
		const uint8Array = encoder.encode(tarballContent)
		const arrayBuffer = uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength)
		const wrongChecksum = 'wrong-checksum-value'.padEnd(64, '0')

		const mockHeaders = {
			get: (name: string) => {
				if (name === 'X-Checksum-SHA256') return wrongChecksum
				if (name === 'X-Package-Version') return '1.0.0'
				return null
			},
		}

		const mockFetch: FetchFn = vi.fn().mockResolvedValue({
			ok: true,
			headers: mockHeaders,
			arrayBuffer: () => Promise.resolve(arrayBuffer),
		} as unknown as Response)

		const result = await downloadInstaller('session-123', 'stable', {
			fetch: mockFetch,
			apiUrl: 'http://localhost:3000',
		})

		expect(result.type).toBe('checksum_mismatch')
		if (result.type === 'checksum_mismatch') {
			expect(result.expected).toBe(wrongChecksum)
			expect(result.actual).not.toBe(wrongChecksum)
		}
	})

	it('encodes session ID and channel in URL', async () => {
		const mockFetch: FetchFn = vi.fn().mockResolvedValue({
			ok: false,
			status: 404,
			json: () => Promise.resolve({ error: 'Not found' }),
		} as unknown as Response)

		await downloadInstaller('session with spaces', 'stable', {
			fetch: mockFetch,
			apiUrl: 'http://localhost:3000',
		})

		expect(mockFetch).toHaveBeenCalledWith(
			'http://localhost:3000/resources/installer/download?session=session+with+spaces&channel=stable',
		)
	})

	it('passes preflight channel in URL when specified', async () => {
		const mockFetch: FetchFn = vi.fn().mockResolvedValue({
			ok: false,
			status: 404,
			json: () => Promise.resolve({ error: 'Not found' }),
		} as unknown as Response)

		await downloadInstaller('session-123', 'preflight', {
			fetch: mockFetch,
			apiUrl: 'http://localhost:3000',
		})

		expect(mockFetch).toHaveBeenCalledWith(
			'http://localhost:3000/resources/installer/download?session=session-123&channel=preflight',
		)
	})
})
