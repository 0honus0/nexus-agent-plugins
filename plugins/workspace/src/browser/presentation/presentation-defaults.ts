import type { LayoutProfile } from '../../shared/layout-types.js';
import type { PresentationProfile } from './presentation-types';

/** Only this table chooses positions, default visibility and navigation for each available-width profile. */
export const presentationProfiles = {
	compact: {
		regions: ['terminal', 'files', 'commands', 'status'],
		initialRegions: ['terminal'],
		primary: 'terminal',
		direction: 'below',
		tools: {
			files: { presentation: 'sheet', defaultOpen: false },
			commands: { presentation: 'sheet', defaultOpen: false },
			status: { presentation: 'sheet', defaultOpen: false },
			themes: { presentation: 'sheet', defaultOpen: false },
			keyboard: { presentation: 'bottom', defaultOpen: false, remember: true },
		},
		navigation: {
			placement: 'bottom',
			display: 'icon',
			items: ['files', 'commands', 'status', 'keyboard'],
		},
	},
	medium: {
		regions: ['terminal', 'files', 'commands', 'status'],
		initialRegions: ['terminal', 'status', 'commands', 'files'],
		primary: 'terminal',
		direction: 'right',
		positions: {
			status: { reference: 'terminal', direction: 'left', width: 0.3 },
			commands: { reference: 'status', direction: 'below', height: 0.5 },
			files: { reference: 'terminal', direction: 'below', height: 0.4 },
		},
		tools: { themes: { presentation: 'sheet', defaultOpen: false } },
		navigation: {
			placement: 'side',
			display: 'icon',
			items: [],
		},
	},
	wide: {
		regions: ['terminal', 'files', 'commands', 'status'],
		initialRegions: ['terminal', 'status', 'commands', 'files'],
		primary: 'terminal',
		direction: 'right',
		positions: {
			status: { reference: 'terminal', direction: 'left', width: 0.3 },
			commands: { reference: 'status', direction: 'below', height: 0.5 },
			files: { reference: 'terminal', direction: 'below', height: 0.4 },
		},
		tools: { themes: { presentation: 'sheet', defaultOpen: false } },
		navigation: {
			placement: 'side',
			display: 'icon',
			items: [],
		},
	},
} satisfies Record<LayoutProfile, PresentationProfile>;
