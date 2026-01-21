/**
 * CI sync check: Ensures the CLI's required Node version matches launchfast-template
 *
 * This script runs in CI to prevent publishing a CLI that is out of sync with
 * the template's declared Node version.
 *
 * Usage: npx tsx scripts/check-node-sync.ts
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// This MUST match the REQUIRED_NODE_MAJOR in src/invariants.ts
const CLI_REQUIRED_NODE_MAJOR = 20

// Read the template's package.json to get the canonical Node version
const templatePkgPath = resolve(__dirname, '../../../launchfast-template/package.json')

let templatePkg: { engines?: { node?: string } }
try {
	templatePkg = JSON.parse(readFileSync(templatePkgPath, 'utf-8'))
} catch (error) {
	console.error(`❌ Could not read template package.json at: ${templatePkgPath}`)
	console.error('   Ensure launchfast-template is cloned as a sibling directory.')
	process.exit(1)
}

const templateNodeVersion = parseInt(templatePkg.engines?.node ?? '', 10)

if (isNaN(templateNodeVersion)) {
	console.error('❌ Could not parse engines.node from launchfast-template/package.json')
	process.exit(1)
}

if (CLI_REQUIRED_NODE_MAJOR !== templateNodeVersion) {
	console.error('❌ Node version mismatch!')
	console.error(`   CLI requires: Node ${CLI_REQUIRED_NODE_MAJOR}`)
	console.error(`   Template requires: Node ${templateNodeVersion}`)
	console.error('')
	console.error('Update REQUIRED_NODE_MAJOR in src/invariants.ts to match the template.')
	process.exit(1)
}

console.log(`✓ Node version in sync: ${CLI_REQUIRED_NODE_MAJOR}`)
