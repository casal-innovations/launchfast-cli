import { checkSystemRequirements } from './invariants.js'
import { startAuthFlow } from './auth/startAuthFlow.js'
import { pollForVerification } from './auth/pollForVerification.js'
import { downloadInstaller, cleanupInstaller, type Channel } from './installer/downloadInstaller.js'
import { promptEmail } from './ui/promptEmail.js'
import { c } from './terminal.js'
import { VERSION } from './version.js'

const POLL_INTERVAL_MS = 3000

/**
 * Parse command line arguments.
 * Returns the release channel based on flags.
 */
function parseArgs(args: string[]): { channel: Channel } {
	const isPreflight = args.includes('--preflight')
	return { channel: isPreflight ? 'preflight' : 'stable' }
}

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
 * @param args - Command line arguments (defaults to process.argv.slice(2))
 */
export async function run(args: string[] = process.argv.slice(2)): Promise<void> {
	setupCleanExit()

	const { channel } = parseArgs(args)
	const isPreflight = channel === 'preflight'

	console.log(`\n🚀 LaunchFast CLI ${c.dim(`v${VERSION}`)}${isPreflight ? c.yellow(' [PREFLIGHT]') : ''}\n`)

	// Check all system requirements (Node, Git, Fly CLI)
	await checkSystemRequirements()

	// Authenticate and get session
	const sessionId = await authenticate()

	// Download installer package
	const installerPath = await downloadInstallerPackage(sessionId, channel)

	// Run installer and cleanup
	try {
		await runInstaller(installerPath)
	} finally {
		await cleanupInstaller(installerPath)
	}
}

/**
 * Download the installer package from the LaunchFast server.
 * Returns the path to the extracted installer.
 */
async function downloadInstallerPackage(sessionId: string, channel: Channel): Promise<string> {
	if (process.env.LAUNCHFAST_SKIP_INSTALLER === 'true') {
		console.log('⚠️  LAUNCHFAST_SKIP_INSTALLER=true — installer download skipped (testing mode)\n')
		return ''
	}

	const channelLabel = channel === 'preflight' ? 'preflight ' : ''
	console.log(`Downloading LaunchFast ${channelLabel}installer package...\n`)

	const result = await downloadInstaller(sessionId, channel)

	if (result.type === 'success') {
		console.log(`✓ Downloaded installer v${result.version}\n`)
		return result.installerPath
	}

	// Handle error cases
	if (result.type === 'auth_error') {
		console.error('Error: Authentication failed.')
		console.error(result.message)
		console.error('\nPlease try running the command again.')
		process.exit(1)
	}

	if (result.type === 'not_found') {
		console.error('Error: No installer package available.')
		console.error(result.message)
		console.error('\nPlease contact support@launchfast.pro if this persists.')
		process.exit(1)
	}

	if (result.type === 'checksum_mismatch') {
		console.error('Error: Package integrity check failed.')
		console.error(`Expected checksum: ${result.expected}`)
		console.error(`Actual checksum: ${result.actual}`)
		console.error('\nThis could indicate a corrupted download. Please try again.')
		process.exit(1)
	}

	// Boundary error
	console.error('Error: Failed to download installer package.')
	console.error(result.error.message)
	console.error('\nPlease check your internet connection and try again.')
	process.exit(1)
}

/**
 * Run the installer package from the extracted path.
 * Handles the expected case of module not found separately from unexpected errors.
 */
async function runInstaller(installerPath: string): Promise<void> {
	if (process.env.LAUNCHFAST_SKIP_INSTALLER === 'true') {
		console.log('⚠️  LAUNCHFAST_SKIP_INSTALLER=true — installer skipped (testing mode)\n')
		return
	}

	// Dynamic import from the extracted package path
	// The package entry point should be at installerPath/dist/index.js
	const modulePath = `file://${installerPath}/dist/index.js`

	let installerModule: { install: () => Promise<void> }
	try {
		installerModule = await import(modulePath)
	} catch (error) {
		// Check for expected "module not found" error
		if (error instanceof Error && 'code' in error && error.code === 'ERR_MODULE_NOT_FOUND') {
			console.error('Error: Could not load installer package.')
			console.error('The downloaded package may be corrupted. Please try again.')
			process.exit(1)
		}
		// Unexpected import error - this is an invariant violation, rethrow
		throw error
	}

	// Installer execution - any errors here are unexpected and should propagate
	await installerModule.install()
}

/**
 * Run the email verification authentication flow.
 * Returns the verified session ID for downloading the installer.
 */
async function authenticate(): Promise<string> {
	const email = await promptEmail()

	console.log(`\nStarting authentication for ${email}...`)

	const sessionId = await startAuthFlow(email)

	console.log('\n📧 Check your email for a verification link.\n')
	console.log('Status: awaiting email verification')
	console.log('Session: active (expires in ~10 minutes)')
	console.log(`Polling every ${POLL_INTERVAL_MS / 1000}s...`)
	console.log('\nPress Ctrl+C to cancel authentication\n')

	// Poll until verified - returns the same session ID once verified
	const verifiedSessionId = await pollForVerification(sessionId)

	console.log('\n✓ Authentication successful!\n')

	return verifiedSessionId
}
