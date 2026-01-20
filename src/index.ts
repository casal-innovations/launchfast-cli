import { exec } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import { startAuthFlow } from './auth/startAuthFlow.js'
import { pollForVerification } from './auth/pollForVerification.js'
import { writeNpmToken } from './npm/writeNpmToken.js'
import { promptEmail } from './ui/promptEmail.js'

const execAsync = promisify(exec)

const POLL_INTERVAL_MS = 3000
const NPMRC_PATH = join(homedir(), '.npmrc')

/**
 * Set up clean exit handler for Ctrl+C
 */
function setupCleanExit(): void {
	process.on('SIGINT', () => {
		console.log('\n\nAuthentication cancelled.')
		process.exit(0)
	})
}

/**
 * Main entry point for the CLI
 */
export async function run(): Promise<void> {
	setupCleanExit()

	console.log('\n🚀 LaunchFast CLI\n')

	if (await hasValidAccess()) {
		console.log('✓ Valid access token found\n')
	} else {
		console.log('No valid access token found. Starting authentication...\n')
		await authenticate()
	}

	await installInstallerPackage()
	await runInstaller()
}

/**
 * Check if user has valid npm access to the private installer package.
 * Returns a boolean result - the "not found" case is an expected outcome, not an error.
 */
async function hasValidAccess(): Promise<boolean> {
	if (process.env.LAUNCHFAST_SKIP_NPM_CHECK === 'true') {
		console.log('⚠️  LAUNCHFAST_SKIP_NPM_CHECK=true — npm access validation skipped (development mode)\n')
		return false // Force authentication flow for testing
	}

	// Boundary call - execAsync can throw for expected reasons (package not accessible)
	// We catch exactly once and convert to explicit boolean result
	try {
		await execAsync('npm view @launchfasthq/installer version --json')
		return true
	} catch {
		// Expected outcome: user doesn't have access to the package
		return false
	}
}

/**
 * Install the private installer package using npm.
 * This is called after authentication to download the package.
 */
async function installInstallerPackage(): Promise<void> {
	if (process.env.LAUNCHFAST_SKIP_INSTALLER === 'true') {
		return
	}

	console.log('Installing LaunchFast installer package...\n')
	try {
		await execAsync('npm install @launchfasthq/installer@latest --no-save')
	} catch (error) {
		if (error instanceof Error) {
			console.error('Error: Failed to install the installer package.')
			console.error('Please ensure your authentication token is valid.')
			if ('stderr' in error) {
				console.error(`\nDetails: ${(error as { stderr: string }).stderr}`)
			}
		}
		process.exit(1)
	}
}

/**
 * Run the installer package.
 * Handles the expected case of module not found separately from unexpected errors.
 */
async function runInstaller(): Promise<void> {
	if (process.env.LAUNCHFAST_SKIP_INSTALLER === 'true') {
		console.log('⚠️  LAUNCHFAST_SKIP_INSTALLER=true — installer skipped (testing mode)\n')
		return
	}

	// Dynamic import is a boundary call that can fail in expected ways
	let installerModule: { install: () => Promise<void> }
	try {
		installerModule = await import('@launchfasthq/installer')
	} catch (error) {
		// Check for expected "module not found" error
		if (error instanceof Error && 'code' in error && error.code === 'ERR_MODULE_NOT_FOUND') {
			console.error('Error: Could not load installer package.')
			console.error('Please ensure you have completed authentication.')
			process.exit(1)
		}
		// Unexpected import error - this is an invariant violation, rethrow
		throw error
	}

	// Installer execution - any errors here are unexpected and should propagate
	await installerModule.install()
}

/**
 * Run the email verification authentication flow
 */
async function authenticate(): Promise<void> {
	const email = await promptEmail()

	console.log(`\nStarting authentication for ${email}...`)

	const sessionId = await startAuthFlow(email)

	console.log('\n📧 Check your email for a verification link.\n')
	console.log('Status: awaiting email verification')
	console.log('Session: active (expires in ~10 minutes)')
	console.log(`Polling every ${POLL_INTERVAL_MS / 1000}s...`)
	console.log('\nPress Ctrl+C to cancel authentication\n')

	const token = await pollForVerification(sessionId)

	await writeNpmToken(token)

	console.log('\n✓ Authentication successful!')
	console.log(`  Access token written to ${NPMRC_PATH} (registry.npmjs.org)\n`)
}
