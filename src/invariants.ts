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

export function checkNodeVersion(): void {
	if (process.env.LAUNCHFAST_SKIP_NODE_CHECK === 'true') {
		return
	}

	const currentMajor = parseInt(process.versions.node.split('.')[0], 10)

	if (currentMajor !== REQUIRED_NODE_MAJOR) {
		const lines = [
			'',
			c.boldRed(`ERROR: Node.js ${REQUIRED_NODE_MAJOR}.x required`),
			'',
			`${c.dim('Detected:')} v${process.versions.node}`,
			'',
			c.boldGreen('Recommended:'),
			`  ${c.green(`mise use node@${REQUIRED_NODE_MAJOR}`)}`,
			c.dim('  # Pins Node per-project'),
			'',
			c.dim('Alternatives:'),
			c.dim(`  nvm install ${REQUIRED_NODE_MAJOR} && nvm use ${REQUIRED_NODE_MAJOR}`),
			c.dim(`  fnm install ${REQUIRED_NODE_MAJOR} && fnm use ${REQUIRED_NODE_MAJOR}`),
			'',
			`${c.bold('Then:')} npx @launchfasthq/create`,
			'',
		]
		console.error(lines.join('\n'))
		process.exit(1)
	}
}

/**
 * Fly CLI availability check with installation prompt.
 *
 * This is async because it may prompt the user for input.
 * Must be called inside run() rather than at module level.
 */
export async function checkFlyCliAsync(): Promise<void> {
	if (process.env.LAUNCHFAST_SKIP_FLY_CHECK === 'true') {
		return
	}

	const flyCheck = spawnSync('fly', ['version'], { stdio: 'pipe' })
	if (flyCheck.status === 0) {
		return
	}

	console.log(c.yellow('\nFly CLI not found.\n'))
	console.log('The Fly CLI is required to deploy LaunchFast apps.')

	const shouldInstall = await promptYesNo('Would you like to install it now? (y/n): ')

	if (!shouldInstall) {
		const lines = [
			'',
			c.boldRed('ERROR: Fly CLI required'),
			'',
			c.boldGreen('Install manually:'),
			c.green('  curl -L https://fly.io/install.sh | sh') + c.dim('  (macOS/Linux)'),
			c.green('  iwr https://fly.io/install.ps1 -useb | iex') + c.dim('  (Windows)'),
			'',
			`${c.bold('Then:')} npx @launchfasthq/create`,
			'',
		]
		console.error(lines.join('\n'))
		process.exit(1)
	}

	const platform = os.platform()
	const installCommand =
		platform === 'win32'
			? 'powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"'
			: 'curl -L https://fly.io/install.sh | sh'

	console.log(`\nInstalling Fly CLI...\n`)

	try {
		execSync(installCommand, { stdio: 'inherit' })
	} catch {
		const lines = [
			'',
			c.boldRed('ERROR: Fly CLI installation failed'),
			'',
			c.boldGreen('Install manually:'),
			c.green('  curl -L https://fly.io/install.sh | sh') + c.dim('  (macOS/Linux)'),
			c.green('  iwr https://fly.io/install.ps1 -useb | iex') + c.dim('  (Windows)'),
			'',
			`${c.bold('Then:')} npx @launchfasthq/create`,
			'',
		]
		console.error(lines.join('\n'))
		process.exit(1)
	}

	const lines = [
		'',
		c.boldGreen('Fly CLI installed successfully!'),
		'',
		c.bold('IMPORTANT: Your shell needs to reload to see the new command.'),
		'',
		c.dim('Next steps:'),
		c.dim('  1. Close this terminal (or run: source ~/.bashrc or ~/.zshrc for zsh)'),
		c.dim('  2. Open a new terminal'),
		c.dim('  3. Run: npx @launchfasthq/create'),
		'',
	]
	console.log(lines.join('\n'))
	process.exit(0)
}

async function promptYesNo(question: string): Promise<boolean> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
	const answer = await rl.question(question)
	rl.close()
	return answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes'
}
