/**
 * Node.js version invariant check
 *
 * This MUST be called as the first executable code in the CLI entrypoint.
 * No auth, filesystem, or network activity should occur before this check.
 */

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
