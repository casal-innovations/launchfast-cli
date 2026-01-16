export default {
	extends: ['@commitlint/config-conventional'],
	rules: {
		'type-enum': [
			2,
			'always',
			['fix', 'feat', 'break', 'chore', 'docs', 'test'],
		],
	},
}
