/**
 * Zero-dependency terminal styling using ANSI escape codes.
 *
 * Color is disabled when:
 * - NO_COLOR env var is set (https://no-color.org/)
 * - TERM=dumb
 * - stdout is not a TTY (piped output)
 *
 * This ensures output remains readable in monochrome terminals
 * and when redirected to files.
 */

const supportsColor = (): boolean => {
	if (process.env.NO_COLOR !== undefined) return false
	if (process.env.TERM === 'dumb') return false
	if (!process.stdout.isTTY) return false
	return true
}

const USE_COLOR = supportsColor()

// ANSI escape codes
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'

const wrap = (code: string, text: string): string =>
	USE_COLOR ? `${code}${text}${RESET}` : text

/**
 * Terminal styling functions.
 * Each returns the input unchanged when color is disabled.
 */
export const c = {
	/** Red text - for errors and invariant violations */
	red: (text: string): string => wrap(RED, text),

	/** Green text - for recommended actions */
	green: (text: string): string => wrap(GREEN, text),

	/** Yellow text - for warnings */
	yellow: (text: string): string => wrap(YELLOW, text),

	/** Bold text - for emphasis and next actions */
	bold: (text: string): string => wrap(BOLD, text),

	/** Dim text - for de-emphasized information */
	dim: (text: string): string => wrap(DIM, text),

	/** Combine bold and red - for critical errors */
	boldRed: (text: string): string => wrap(`${BOLD}${RED}`, text),

	/** Combine bold and green - for primary recommended action */
	boldGreen: (text: string): string => wrap(`${BOLD}${GREEN}`, text),
} as const
