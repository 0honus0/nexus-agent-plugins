import { inject, shallowReactive, type InjectionKey } from 'vue';
import type { TerminalInput } from '../terminal/terminal-input';
interface Target {
	name: string;
	ready(): boolean;
	input: TerminalInput;
}

export function createCommandTargets() {
	const targets = shallowReactive(new Map<string, Target>());
	return {
		list: () =>
			[...targets].filter(([, target]) => target.ready()).map(([id, target]) => ({ id, name: target.name })),

		register(id: string, target: Target) {
			targets.set(id, target);
			return () => {
				if (targets.get(id) === target) targets.delete(id);
			};
		},

		send(ids: string[], command: string) {
			let count = 0;
			for (const id of ids) {
				const target = targets.get(id);
				if (target?.ready()) {
					target.input.command(command);
					count++;
				}
			}
			return count;
		},
	};
}

export const commandTargetsKey: InjectionKey<ReturnType<typeof createCommandTargets>> =
	Symbol('workspace-command-targets');

export const useCommandTargets = () => inject(commandTargetsKey)!;
