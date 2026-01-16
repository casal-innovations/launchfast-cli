import * as readline from 'readline/promises'
import { z } from 'zod'

export const EmailSchema = z.string().email('Please enter a valid email address')

export interface PromptEmailDeps {
	createInterface: typeof readline.createInterface
	stdin: NodeJS.ReadableStream
	stdout: NodeJS.WritableStream
}

export async function promptEmail({
	createInterface = readline.createInterface,
	stdin = process.stdin,
	stdout = process.stdout,
}: Partial<PromptEmailDeps> = {}): Promise<string> {
	while (true) {
		const rl = createInterface({ input: stdin, output: stdout })
		const answer = await rl.question('Enter your LaunchFast purchase email: ')
		rl.close()

		const result = EmailSchema.safeParse(answer.trim())
		if (result.success) {
			return result.data
		}

		console.log(`\n${result.error.errors[0].message}\n`)
	}
}
