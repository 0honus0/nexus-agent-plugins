import { expect, type Locator, type Page } from '@playwright/test';

export async function expectFormFields(scope: Locator): Promise<void> {
	await expect(scope).toBeVisible();
	const issues = await scope.evaluate((element) => {
		const labels = [...element.querySelectorAll<HTMLLabelElement>('label[for]')];
		const controls = [
			...element.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
				'input:not([type="hidden"]), select, textarea',
			),
		];

		const fields = controls.map((control) => {
			const ids = control.getAttribute('aria-labelledby')?.trim().split(/\s+/u) ?? [];
			const hasLabel =
				[...(control.labels ?? [])].some((label) => label.textContent?.trim()) ||
				!!control.getAttribute('aria-label')?.trim() ||
				ids.some((id) => control.ownerDocument.getElementById(id)?.textContent?.trim());
			return {
				field: { tag: control.localName, type: control.type, id: control.id, name: control.name },
				hasLabel,
			};
		});

		return {
			invalidFor: labels.filter((label) => !label.control).map((label) => label.htmlFor),
			missingIdOrName: fields
				.filter(({ field }) => !field.id.trim() && !field.name.trim())
				.map(({ field }) => field),
			missingLabel: fields.filter(({ hasLabel }) => !hasLabel).map(({ field }) => field),
		};
	});

	expect(issues).toEqual({ invalidFor: [], missingIdOrName: [], missingLabel: [] });
}

export function collectBrowserErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
	page.on('console', (message) => {
		if (message.type() !== 'error' && message.type() !== 'warning') return;
		const text = message.text();
		if (
			/\[Vue warn\]|WORKSPACE_OPERATION_FAILED|PLUGIN_VIEW_(?:CLEANUP_)?FAILED|PLUGIN_BACKGROUND_TASK_FAILED|PLUGIN_SERVICE_EXPIRED|randomUUID/u.test(
				text,
			)
		)
			errors.push(text);
	});
	return errors;
}
