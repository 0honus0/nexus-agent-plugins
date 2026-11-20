import { LayoutProfiles, type LayoutProfile } from '../shared/layout-types';

export function resolveLayoutProfile(width: number): LayoutProfile {
	if (width >= LayoutProfiles.wide.minWidth) return 'wide';
	if (width >= LayoutProfiles.medium.minWidth) return 'medium';
	return 'compact';
}
