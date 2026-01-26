/**
 * Invariant checks
 *
 * These MUST be called as the first executable code in the CLI entrypoint.
 * No auth, filesystem, or network activity should occur before these checks.
 */

import { spawnSync, execSync } from 'child_process'
import * as readline from 'readline/promises'
import os from 'os'
import { c } from './terminal.js'

const REQUIRED_NODE_MAJOR = 20

interface RequirementStatus {
	name: string
	version: string | null
	installed: boolean
	usedFor: string
}

function checkNodeStatus(): RequirementStatus {
	const currentVersion = process.versions.node
	const currentMajor = parseInt(currentVersion.split('.')[0], 10)
	const installed = currentMajor === REQUIRED_NODE_MAJOR

	return {
		name: `Node.js (v${REQUIRED_NODE_MAJOR})`,
		version: installed ? `v${currentVersion}` : `v${currentVersion} (need v${REQUIRED_NODE_MAJOR})`,
		installed,
		usedFor: 'Runtime & tooling',
	}
}

function checkGitStatus(): RequirementStatus {
	const result = spawnSync('git', ['--version'], { stdio: 'pipe' })
	const installed = result.status === 0
	let version: string | null = null

	if (installed && result.stdout) {
		const match = result.stdout.toString().match(/git version ([\d.]+)/)
		version = match ? `v${match[1]}` : 'installed'
	}

	return {
		name: 'Git',
		version,
		installed,
		usedFor: 'Repo initialization',
	}
}

function checkFlyStatus(): RequirementStatus {
	const result = spawnSync('fly', ['version'], { stdio: 'pipe' })
	const installed = result.status === 0
	let version: string | null = null

	if (installed && result.stdout) {
		const output = result.stdout.toString().trim()
		// fly version output: "fly v0.1.xxx ..."
		const match = output.match(/fly (v[\d.]+)/)
		version = match ? match[1] : 'installed'
	}

	return {
		name: 'Fly CLI',
		version,
		installed,
		usedFor: 'App deployment',
	}
}

function formatStatusTable(requirements: RequirementStatus[]): string {
	const header = 'LaunchFast — System Requirements'
	const divider = '─'.repeat(52)

	const lines = [
		'',
		c.bold(header),
		c.dim(divider),
		'',
		`${pad('Requirement', 20)} ${pad('Status', 13)} ${pad('Used For', 18)}`,
		c.dim(divider),
	]

	for (const req of requirements) {
		const status = req.installed
			? c.green('✓ Installed')
			: c.red('✗ Not found')
		lines.push(`${pad(req.name, 20)} ${status}   ${c.dim(req.usedFor)}`)
	}

	lines.push('')

	return lines.join('\n')
}

function pad(str: string, length: number): string {
	return str.padEnd(length)
}

/**
 * Check all system requirements and display status table.
 * Returns true if all requirements are met, false otherwise.
 */
export async function checkSystemRequirements(): Promise<void> {
	if (process.env.LAUNCHFAST_SKIP_REQUIREMENTS_CHECK === 'true') {
		return
	}

	const nodeStatus = checkNodeStatus()
	const gitStatus = checkGitStatus()
	const flyStatus = checkFlyStatus()

	const requirements = [nodeStatus, gitStatus, flyStatus]
	const missingRequirements = requirements.filter((r) => !r.installed)

	// Always show the table
	console.log(formatStatusTable(requirements))

	if (missingRequirements.length === 0) {
		return // All requirements met
	}

	// Show what's missing
	const missingNode = !nodeStatus.installed
	const missingGit = !gitStatus.installed
	const missingFly = !flyStatus.installed

	// Node and Git must be installed manually
	if (missingNode || missingGit) {
		console.log(c.boldRed('Missing required tools:\n'))

		if (missingNode) {
			console.log(c.bold('Node.js v20:'))
			console.log(c.green('  Recommended:'))
			console.log(c.green(`    mise use node@${REQUIRED_NODE_MAJOR}`))
			console.log(c.dim('    # Pins Node per-project'))
			console.log(c.dim('  Alternatives:'))
			console.log(c.dim(`    nvm install ${REQUIRED_NODE_MAJOR} && nvm use ${REQUIRED_NODE_MAJOR}`))
			console.log(c.dim(`    fnm install ${REQUIRED_NODE_MAJOR} && fnm use ${REQUIRED_NODE_MAJOR}`))
			console.log('')
		}

		if (missingGit) {
			console.log(c.bold('Git:'))
			console.log(c.green('  https://git-scm.com/downloads'))
			console.log('')
		}

		console.log(`${c.bold('Then:')} npx @launchfasthq/create`)
		console.log('')
		process.exit(1)
	}

	// Only Fly is missing - we can offer to install it
	if (missingFly) {
		const shouldInstall = await promptYesNo(
			'Would you like to install the Fly CLI now? (y/n): ',
		)

		if (!shouldInstall) {
			console.log('')
			console.log(c.bold('Install Fly CLI manually:'))
			console.log(c.green('  curl -L https://fly.io/install.sh | sh') + c.dim('  (macOS/Linux)'))
			console.log(c.green('  iwr https://fly.io/install.ps1 -useb | iex') + c.dim('  (Windows)'))
			console.log('')
			console.log(`${c.bold('Then:')} npx @launchfasthq/create`)
			console.log('')
			process.exit(1)
		}

		await installFlyCli()
	}
}

async function installFlyCli(): Promise<void> {
	const platform = os.platform()
	const installCommand =
		platform === 'win32'
			? 'powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"'
			: 'curl -L https://fly.io/install.sh | sh'

	console.log(`\nInstalling Fly CLI...\n`)

	try {
		execSync(installCommand, { stdio: 'inherit' })
	} catch {
		console.log('')
		console.log(c.boldRed('Fly CLI installation failed.'))
		console.log('')
		console.log(c.bold('Install manually:'))
		console.log(c.green('  curl -L https://fly.io/install.sh | sh') + c.dim('  (macOS/Linux)'))
		console.log(c.green('  iwr https://fly.io/install.ps1 -useb | iex') + c.dim('  (Windows)'))
		console.log('')
		console.log(`${c.bold('Then:')} npx @launchfasthq/create`)
		console.log('')
		process.exit(1)
	}

	console.log('')
	console.log(c.boldGreen('Fly CLI installed successfully!'))
	console.log('')
	console.log(c.bold('IMPORTANT: Your shell needs to reload to see the new command.'))
	console.log('')
	console.log(c.dim('Next steps:'))
	console.log(c.dim('  1. Close this terminal (or run: source ~/.bashrc or ~/.zshrc for zsh)'))
	console.log(c.dim('  2. Open a new terminal'))
	console.log(c.dim('  3. Run: npx @launchfasthq/create'))
	console.log('')
	process.exit(0)
}

async function promptYesNo(question: string): Promise<boolean> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
	const answer = await rl.question(question)
	rl.close()
	return answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes'
}

// Legacy exports for backwards compatibility during transition
export function checkNodeVersion(): void {
	// Now handled by checkSystemRequirements
}

export async function checkFlyCliAsync(): Promise<void> {
	// Now handled by checkSystemRequirements
}
