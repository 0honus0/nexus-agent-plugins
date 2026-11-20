import { computed } from 'vue';
import type { PluginContextApi } from 'nexus-terminal/browser';
import type { PluginWindowApi } from 'nexus-terminal/browser';
import type { SessionInfo } from '../../shared/workspace-types';
import type { WorkspaceI18n } from '../workspace-i18n';
import type { SessionTransport } from '../use-session-transport';
import type { TerminalInput } from '../terminal/terminal-input';
import TerminalPane from '../TerminalPane.vue';
import FilePane from '../FilePane.vue';
import QuickCommands from '../commands/QuickCommands.vue';
import ServerStatus from '../status/ServerStatus.vue';
import TerminalAppearance from '../appearance/TerminalAppearance.vue';
import TerminalKeyboard from '../terminal/TerminalKeyboard.vue';
import type { PresentationItem, WorkspaceTool } from './presentation-types';
import type { LayoutProfile } from '../../shared/layout-types.js';

export interface PresentationContext {
	ctx: PluginContextApi;
	view: PluginWindowApi;
	i18n: WorkspaceI18n;
	session: SessionInfo;
	host?: string;
	active: boolean;
	transport: SessionTransport;
	input: TerminalInput;
	busy(value: boolean): void;
}

export function createPresentationRegistry(
	context: () => PresentationContext,
	visible: (id: WorkspaceTool) => boolean,
	profile: () => LayoutProfile,
) {
	return computed<PresentationItem[]>(() => {
		const c = context();

		const common = () => ({ ctx: c.ctx, view: c.view, i18n: c.i18n });

		return [
			{
				id: 'terminal',
				kind: 'region',
				className: 'workspace-terminal-slot',
				component: TerminalPane,

				props: () => ({
					...common(),
					session: c.session,
					transport: c.transport,
					input: c.input,
					profile: profile(),
					active: c.active && visible('terminal'),
				}),
			},
			{
				id: 'files',
				kind: 'region',
				className: 'workspace-file-slot',
				component: FilePane,

				props: () => ({
					...common(),
					sessionId: c.session.id,
					enabled: c.active && visible('files') && c.transport.connected.value,
					onBusy: c.busy,
				}),
			},
			{
				id: 'commands',
				kind: 'region',
				component: QuickCommands,

				props: () => ({ ctx: c.ctx, i18n: c.i18n, sessionId: c.session.id }),
			},
			{
				id: 'status',
				kind: 'region',
				component: ServerStatus,

				props: () => ({
					ctx: c.ctx,
					i18n: c.i18n,
					sessionId: c.session.id,
					host: c.host,
					connected: c.transport.connected.value,
					enabled: c.active && visible('status') && c.transport.connected.value,
				}),
			},
			{
				id: 'themes',
				kind: 'tool',
				component: TerminalAppearance,

				props: () => ({ i18n: c.i18n, active: c.active && visible('themes'), profile: profile() }),
			},
			{
				id: 'keyboard',
				kind: 'tool',
				component: TerminalKeyboard,

				props: () => ({
					input: c.input,
					i18n: c.i18n,
					active: c.active && visible('keyboard'),
					enabled: c.active && c.transport.connected.value && !c.transport.terminalClosed.value,
				}),
			},
		];
	});
}
