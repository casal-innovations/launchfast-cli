import { describe, it, expect, vi, beforeEach } from 'vitest'
import { writeNpmToken } from './writeNpmToken.js'

describe('writeNpmToken', () => {
	const mockFs = {
		readFile: vi.fn(),
		writeFile: vi.fn().mockResolvedValue(undefined),
	}

	beforeEach(() => {
		vi.clearAllMocks()
		mockFs.writeFile.mockResolvedValue(undefined)
	})

	it('creates .npmrc if missing', async () => {
		const enoentError = Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' })
		mockFs.readFile.mockRejectedValue(enoentError)

		await writeNpmToken('new-token', {
			fs: mockFs,
			npmrcPath: '/tmp/test/.npmrc',
		})

		expect(mockFs.writeFile).toHaveBeenCalledWith('/tmp/test/.npmrc', expect.stringContaining('//registry.npmjs.org/:_authToken=new-token'))
	})

	it('preserves existing config entries', async () => {
		mockFs.readFile.mockResolvedValue('other_config=value\n')

		await writeNpmToken('new-token', {
			fs: mockFs,
			npmrcPath: '/tmp/test/.npmrc',
		})

		const writtenContent = mockFs.writeFile.mock.calls[0][1]
		expect(writtenContent).toContain('other_config=value')
		expect(writtenContent).toContain('//registry.npmjs.org/:_authToken=new-token')
	})

	it('overwrites existing auth token deterministically', async () => {
		mockFs.readFile.mockResolvedValue('//registry.npmjs.org/:_authToken=old-token\n')

		await writeNpmToken('new-token', {
			fs: mockFs,
			npmrcPath: '/tmp/test/.npmrc',
		})

		const writtenContent = mockFs.writeFile.mock.calls[0][1]
		expect(writtenContent).toContain('//registry.npmjs.org/:_authToken=new-token')
		expect(writtenContent).not.toContain('old-token')
	})

	it('performs atomic write (single writeFile call)', async () => {
		mockFs.readFile.mockResolvedValue('')

		await writeNpmToken('token', {
			fs: mockFs,
			npmrcPath: '/tmp/test/.npmrc',
		})

		expect(mockFs.writeFile).toHaveBeenCalledTimes(1)
	})

	it('fails clearly if file is not writable', async () => {
		mockFs.readFile.mockResolvedValue('')
		mockFs.writeFile.mockRejectedValue(new Error('EACCES: permission denied'))

		await expect(
			writeNpmToken('token', {
				fs: mockFs,
				npmrcPath: '/tmp/test/.npmrc',
			})
		).rejects.toThrow('EACCES')
	})

	it('preserves multiple existing config entries', async () => {
		mockFs.readFile.mockResolvedValue('registry=https://custom.registry.com\nalways-auth=true\nemail=test@example.com\n')

		await writeNpmToken('new-token', {
			fs: mockFs,
			npmrcPath: '/tmp/test/.npmrc',
		})

		const writtenContent = mockFs.writeFile.mock.calls[0][1]
		expect(writtenContent).toContain('registry=https://custom.registry.com')
		expect(writtenContent).toContain('always-auth=true')
		expect(writtenContent).toContain('email=test@example.com')
		expect(writtenContent).toContain('//registry.npmjs.org/:_authToken=new-token')
	})
})
