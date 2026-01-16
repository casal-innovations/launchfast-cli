import { describe, it, expect } from 'vitest'
import { EmailSchema } from './promptEmail.js'

describe('EmailSchema', () => {
	it('accepts valid email addresses', () => {
		const validEmails = ['user@example.com', 'test.user@domain.org', 'name+tag@company.co.uk', 'a@b.co']

		for (const email of validEmails) {
			const result = EmailSchema.safeParse(email)
			expect(result.success, `Expected "${email}" to be valid`).toBe(true)
		}
	})

	it('rejects invalid email addresses', () => {
		const invalidEmails = ['not-an-email', 'missing@tld', '@no-local-part.com', 'spaces in@email.com', 'double@@at.com']

		for (const email of invalidEmails) {
			const result = EmailSchema.safeParse(email)
			expect(result.success, `Expected "${email}" to be invalid`).toBe(false)
		}
	})

	it('rejects empty strings', () => {
		const result = EmailSchema.safeParse('')
		expect(result.success).toBe(false)
	})

	it('rejects whitespace-only input', () => {
		const whitespaceInputs = ['   ', '\t', '\n', '  \t\n  ']

		for (const input of whitespaceInputs) {
			const result = EmailSchema.safeParse(input)
			expect(result.success, `Expected whitespace "${JSON.stringify(input)}" to be invalid`).toBe(false)
		}
	})
})
