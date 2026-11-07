import globals from 'globals';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';

const unused = [
	'error',
	{
		argsIgnorePattern: '^_',
		caughtErrorsIgnorePattern: '^_',
		varsIgnorePattern: '^_',
	},
];

export default [
	{ ignores: ['dist/**', 'frontend/**', 'node_modules/**'] },
	...vue.configs['flat/essential'],
	{
		files: ['src/**/*.ts', 'vite.config.ts'],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
			globals: { ...globals.browser, ...globals.node },
		},
		plugins: { '@typescript-eslint': tseslint.plugin },
		rules: { '@typescript-eslint/no-unused-vars': unused },
	},
	{
		files: ['src/**/*.vue'],
		languageOptions: {
			parserOptions: { parser: tseslint.parser, ecmaVersion: 'latest', sourceType: 'module' },
			globals: { ...globals.browser, ...globals.node },
		},
		plugins: { '@typescript-eslint': tseslint.plugin },
		rules: {
			'@typescript-eslint/no-unused-vars': unused,
			'vue/no-mutating-props': ['error', { shallowOnly: true }],
			'vue/no-use-v-if-with-v-for': 'error',
		},
	},
];
