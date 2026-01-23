import { createHash } from 'crypto'
import { mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { extract } from 'tar'
import type { FetchFn } from '../types.js'
import { type BoundaryError, networkError, parseError } from '../result.js'

/**
 * Result of downloading and extracting the installer package.
 */
export type DownloadResult =
	| { type: 'success'; installerPath: string; version: string }
	| { type: 'auth_error'; message: string }
	| { type: 'not_found'; message: string }
	| { type: 'checksum_mismatch'; expected: string; actual: string }
	| { type: 'boundary_error'; error: BoundaryError }

export type Channel = 'stable' | 'preflight'

export interface DownloadInstallerDeps {
	fetch: FetchFn
	apiUrl: string
}

function getDefaultDeps(): DownloadInstallerDeps {
	return {
		fetch: globalThis.fetch,
		apiUrl: process.env.LAUNCHFAST_API ?? 'https://launchfast.pro',
	}
}

/**
 * Downloads and extracts the installer package from the LaunchFast server.
 *
 * @param sessionId - The verified CLI session ID
 * @param channel - The release channel ('stable' or 'preflight')
 * @param deps - Optional dependency injection for testing
 * @returns Result containing the path to the extracted installer or an error
 */
export async function downloadInstaller(
	sessionId: string,
	channel: Channel = 'stable',
	deps: Partial<DownloadInstallerDeps> = {},
): Promise<DownloadResult> {
	const { fetch, apiUrl } = { ...getDefaultDeps(), ...deps }

	// Build download URL with channel parameter
	const downloadUrl = new URL(`${apiUrl}/resources/installer/download`)
	downloadUrl.searchParams.set('session', sessionId)
	downloadUrl.searchParams.set('channel', channel)

	// Download tarball
	let response: Response
	try {
		response = await fetch(downloadUrl.toString())
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		return { type: 'boundary_error', error: networkError(message) }
	}

	// Handle error responses
	if (!response.ok) {
		if (response.status === 400 || response.status === 403 || response.status === 404) {
			try {
				const data = (await response.json()) as { error?: string }
				if (response.status === 403) {
					return { type: 'auth_error', message: data.error ?? 'Session not verified or expired' }
				}
				if (response.status === 404) {
					return { type: 'not_found', message: data.error ?? 'No installer package available' }
				}
				return { type: 'auth_error', message: data.error ?? 'Invalid request' }
			} catch {
				return { type: 'auth_error', message: `Server error: ${response.status}` }
			}
		}
		return { type: 'boundary_error', error: networkError(`HTTP ${response.status}`) }
	}

	// Get expected checksum and version from headers
	const expectedChecksum = response.headers.get('X-Checksum-SHA256')
	const version = response.headers.get('X-Package-Version') ?? 'unknown'

	if (!expectedChecksum) {
		return { type: 'boundary_error', error: parseError('Missing checksum header') }
	}

	// Read response body as buffer
	let tarballBuffer: Buffer
	try {
		const arrayBuffer = await response.arrayBuffer()
		tarballBuffer = Buffer.from(arrayBuffer)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		return { type: 'boundary_error', error: parseError(message) }
	}

	// Verify checksum
	const actualChecksum = createHash('sha256').update(tarballBuffer).digest('hex')
	if (actualChecksum !== expectedChecksum) {
		return {
			type: 'checksum_mismatch',
			expected: expectedChecksum,
			actual: actualChecksum,
		}
	}

	// Create temp directory for extraction
	const tempDir = join(tmpdir(), `launchfast-installer-${Date.now()}`)
	try {
		await mkdir(tempDir, { recursive: true })
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		return { type: 'boundary_error', error: parseError(`Failed to create temp directory: ${message}`) }
	}

	// Write tarball to temp file and extract
	const tarballPath = join(tempDir, 'package.tgz')
	try {
		await writeFile(tarballPath, tarballBuffer)
		await extract({
			file: tarballPath,
			cwd: tempDir,
		})
	} catch (error) {
		// Cleanup on failure
		await rm(tempDir, { recursive: true, force: true }).catch(() => {})
		const message = error instanceof Error ? error.message : String(error)
		return { type: 'boundary_error', error: parseError(`Failed to extract package: ${message}`) }
	}

	// npm pack creates a 'package' directory inside the tarball
	const installerPath = join(tempDir, 'package')

	return { type: 'success', installerPath, version }
}

/**
 * Cleans up the extracted installer directory.
 */
export async function cleanupInstaller(installerPath: string): Promise<void> {
	// Guard against empty path - this happens when LAUNCHFAST_SKIP_INSTALLER=true
	if (!installerPath) {
		return
	}

	// Only clean up paths that look like our temp directories
	// This prevents accidental deletion of other directories
	if (!installerPath.includes('launchfast-installer-')) {
		return
	}

	// The installerPath is tempDir/package, so we need to remove the parent
	const tempDir = join(installerPath, '..')
	await rm(tempDir, { recursive: true, force: true }).catch(() => {
		// Ignore cleanup errors - best effort
	})
}
