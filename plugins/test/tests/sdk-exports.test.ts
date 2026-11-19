import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as browser from 'nexus-terminal/browser';
import * as ui from 'nexus-terminal/browser/ui';
import * as node from 'nexus-terminal/node';

test('发布包的三个入口维持明确的运行时导出', async () => {
	assert.deepEqual(
		Object.keys(node).sort(),
		[
			'CryptoOptionsSchema',
			'HttpFailure',
			'LogLevelSchema',
			'LogParamsSchema',
			'PluginCryptoErrorCodeSchema',
			'PluginCryptoFailureSchema',
			'PluginLogInputSchema',
		].sort(),
	);
	assert.deepEqual(
		Object.keys(browser).sort(),
		[
			'HttpProblemCodeSchema',
			'HttpProblemSchema',
			'LogLevelSchema',
			'LogParamsSchema',
			'PluginHttpError',
			'PluginLogInputSchema',
		].sort(),
	);
	assert.deepEqual(
		Object.keys(ui).sort(),
		[
			'UiActionCard',
			'UiBadge',
			'UiButton',
			'UiCard',
			'UiContextMenu',
			'UiDialog',
			'UiDropdownMenu',
			'UiEmptyState',
			'UiErrorCode',
			'UiErrorCodeSchema',
			'UiField',
			'UiFormRow',
			'UiInput',
			'UiList',
			'UiListItem',
			'UiProgress',
			'UiProgressRow',
			'UiResizeHandle',
			'UiScrollArea',
			'UiSection',
			'UiSelect',
			'UiSlider',
			'UiSwitch',
			'UiTabs',
			'UiToastStack',
			'UiToolbar',
			'UiTransition',
			'uiResizeEdges',
			'vSelectableAction',
		].sort(),
	);
	const internal = 'nexus-terminal/src/app/node/app.js';
	await assert.rejects(import(internal), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
});
