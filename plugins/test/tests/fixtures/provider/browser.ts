import type { AuthLoginContribution, PluginModuleApi } from 'nexus-terminal/browser';
import type {} from '../../../src/sdk-fixture-types.js';

const login = {
	id: 'fixture',
	label: 'Fixture login',

	async start({ baseURL, signal, onComplete }) {
		const token = sessionStorage.getItem('nexus-sdk-fixture-token');
		const response = await fetch(baseURL + 'finish', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ token }),
			signal,
		});
		if (!response.ok) throw new Error('FIXTURE_LOGIN_FAILED');
		await onComplete();
	},
} satisfies AuthLoginContribution;

export const activate: PluginModuleApi['activate'] = (context) => {
	context.provide('fixture', {
		read: () => 'browser-provider',
	});
	context.contribute({ login: [login] });
	context.self.readiness.set({ state: 'ready' });
};
