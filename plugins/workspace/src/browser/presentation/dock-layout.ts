import type { WorkspaceLayout } from '../../shared/workspace-layout-types';

type Dock = WorkspaceLayout['dock'];
type GridNode = Dock['grid']['root'];
type Axis = `${Dock['grid']['orientation']}`;

function paneIds(node: GridNode): string[] {
	return Array.isArray(node.data) ? node.data.flatMap(paneIds) : node.data.views;
}

function otherAxis(axis: Axis): Axis {
	return axis === 'HORIZONTAL' ? 'VERTICAL' : 'HORIZONTAL';
}

function sizeKey(axis: Axis, node: GridNode) {
	return axis + ':' + [...paneIds(node)].sort().join(',');
}

/** Structure ignores Dockview group IDs, active panels, headers and all geometry. */
export function dockStructure(dock: Dock, tools: WorkspaceLayout['tools']) {
	function structure(node: GridNode): unknown {
		return [node.visible !== false, Array.isArray(node.data) ? node.data.map(structure) : node.data.views];
	}

	return JSON.stringify([dock.grid.orientation, structure(dock.grid.root), tools]);
}

export function dockSizes(dock: Dock) {
	const result: Record<string, number> = {};

	function capture(node: GridNode, axis: Axis) {
		if (!Array.isArray(node.data)) return;
		const children = node.data;
		const total = children.reduce((sum, child) => sum + (child.size ?? 0), 0);
		for (const child of children) {
			if (children.length > 1 && total && child.size) result[sizeKey(axis, child)] = child.size / total;
			capture(child, otherAxis(axis));
		}
	}

	capture(dock.grid.root, dock.grid.orientation);
	return result;
}

export function withDockSizes(dock: Dock, sizes: Readonly<Record<string, number>>): Dock {
	function resize(node: GridNode, axis: Axis): GridNode {
		if (!Array.isArray(node.data)) return node;
		const total = node.data.reduce((sum, child) => sum + (child.size ?? 0), 0);
		const preferred = node.data.map((child) => sizes[sizeKey(axis, child)]);
		const known = preferred.reduce((sum, ratio) => sum + (ratio ?? 0), 0);
		const unmeasured = node.data.reduce(
			(sum, child, index) => sum + (preferred[index] === undefined ? (child.size ?? 0) : 0),
			0,
		);
		// If an edit replaces just one side of a split, reserve the existing side's ratio first.
		const fallback = unmeasured && known < 1 ? (1 - known) / unmeasured : 1 / (total || 1);
		const weights = node.data.map((child, index) => preferred[index] ?? (child.size ?? 0) * fallback);
		const sum = weights.reduce((a, b) => a + b, 0);
		return {
			...node,
			data: node.data.map((child, index) => ({
				...resize(child, otherAxis(axis)),
				size: sum && total ? Math.round((total * weights[index]) / sum) : child.size,
			})),
		};
	}

	return { ...dock, grid: { ...dock.grid, root: resize(dock.grid.root, dock.grid.orientation) } };
}
