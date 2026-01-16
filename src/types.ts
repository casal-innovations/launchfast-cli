// Dependency injection types
export type FetchFn = (input: string | URL, init?: RequestInit) => Promise<Response>

export type SleepFn = (ms: number) => Promise<void>

export type ExitFn = (code: number) => never

export interface FsModule {
	readFile(path: string, encoding: 'utf-8'): Promise<string>
	writeFile(path: string, content: string): Promise<void>
}

