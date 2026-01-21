/**
 * Package version utilities
 *
 * Uses createRequire to read package.json at runtime.
 * This works reliably in ESM without import assertions.
 */

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

interface PackageJson {
	version: string
	name: string
}

const pkg = require('../package.json') as PackageJson

export const VERSION = pkg.version
export const NAME = pkg.name
