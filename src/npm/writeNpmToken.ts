import { readFile, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { parse, stringify } from 'ini'
import type { FsModule } from '../types.js'

export interface WriteNpmTokenDeps {
	fs: FsModule
	npmrcPath: string
}

function getDefaultDeps(): WriteNpmTokenDeps {
	return {
		fs: {
			readFile: (path, encoding) => readFile(path, encoding),
			writeFile: (path, content) => writeFile(path, content),
		},
		npmrcPath: join(homedir(), '.npmrc'),
	}
}

/**
 * Reads the existing .npmrc file content.
 * Returns null if the file doesn't exist (expected outcome, not an error).
 */
async function readNpmrcContent(
	fs: FsModule,
	npmrcPath: string,
): Promise<string | null> {
	try {
		return await fs.readFile(npmrcPath, 'utf-8')
	} catch (error) {
		// Check for expected "file not found" error
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
			return null
		}
		// Unexpected filesystem error - propagate as invariant violation
		throw error
	}
}

export async function writeNpmToken(token: string, deps: Partial<WriteNpmTokenDeps> = {}): Promise<void> {
	const { fs, npmrcPath } = { ...getDefaultDeps(), ...deps }

	// Read existing config or start fresh
	const existingContent = await readNpmrcContent(fs, npmrcPath)
	const config: Record<string, string> = existingContent
		? (parse(existingContent) as Record<string, string>)
		: {}

	// Scoped token entry using "nerf dart" format
	config['//registry.npmjs.org/:_authToken'] = token

	await fs.writeFile(npmrcPath, stringify(config))
}
