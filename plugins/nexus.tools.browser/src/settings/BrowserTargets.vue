<script setup lang="ts">
	import { computed, toRaw } from 'vue';
	import type { AgentBrowserTarget } from '@nexus-terminal/shared/agent/integrations/browser-model';
	import { UiButton, UiCheckbox, UiFormField, UiInput, UiTextarea } from '@settings-ui/foundation/ui';

	const endpointPlaceholder = 'wss://browser.example/devtools/browser/…';
	const model = defineModel<AgentBrowserTarget[]>({ required: true });
	const props = defineProps<{ locale: string; disabled: boolean }>();
	const text = computed(() =>
		props.locale === 'zh-CN'
			? {
					title: '浏览器目标',
					add: '添加目标',
					remove: '删除',
					id: '目标标识',
					endpoint: 'CDP 地址',
					priority: '优先级',
					plaintext: '允许明文 WebSocket',
					tls: '验证 TLS 证书',
					addEndpoint: '添加备用地址',
					patterns: '允许访问的页面',
					hint: '每行一个 HTTP(S) 地址；路径末尾可使用 *。仅管理者可修改，保存后关闭此实例原有会话。',
					empty: '尚未配置浏览器目标。',
				}
			: props.locale === 'ja-JP'
				? {
						title: 'ブラウザー接続先',
						add: '接続先を追加',
						remove: '削除',
						id: '接続先 ID',
						endpoint: 'CDP アドレス',
						priority: '優先順位',
						plaintext: '平文 WebSocket を許可',
						tls: 'TLS 証明書を検証',
						addEndpoint: '予備アドレスを追加',
						patterns: '許可するページ',
						hint: 'HTTP(S) アドレスを1行ずつ入力。パス末尾に * を使用できます。管理者のみ変更でき、保存するとこのインスタンスの既存セッションを閉じます。',
						empty: '接続先が設定されていません。',
					}
				: {
						title: 'Browser targets',
						add: 'Add target',
						remove: 'Remove',
						id: 'Target ID',
						endpoint: 'CDP address',
						priority: 'Priority',
						plaintext: 'Allow plaintext WebSocket',
						tls: 'Verify TLS certificate',
						addEndpoint: 'Add fallback address',
						patterns: 'Allowed pages',
						hint: 'One HTTP(S) URL per line; a final path * is allowed. Only administrators can edit. Saving closes this instance’s existing sessions.',
						empty: 'No browser targets configured.',
					},
	);

	function change(index: number, edit: (target: AgentBrowserTarget) => void): void {
		const targets = structuredClone(toRaw(model.value));
		const target = targets[index];
		if (!target) return;
		edit(target);
		model.value = targets;
	}

	function add(): void {
		model.value = [
			...model.value,
			{
				id: '',
				endpoints: [{ url: '', priority: 0, allowPlaintext: false, verifyTls: true }],
				allowedUrlPatterns: [],
			},
		];
	}
	function remove(index: number): void {
		model.value = model.value.filter((_, position) => position !== index);
	}

	function setId(index: number, value: string | number | null): void {
		change(index, (row) => {
			row.id = String(value ?? '');
		});
	}

	function setEndpoint(
		index: number,
		position: number,
		key: 'url' | 'priority' | 'allowPlaintext' | 'verifyTls',
		value: string | number | boolean | null,
	): void {
		change(index, (row) => {
			const endpoint = row.endpoints[position];
			if (!endpoint) return;
			if (key === 'url') endpoint.url = String(value ?? '');
			else if (key === 'priority') endpoint.priority = value === '' || value === null ? NaN : Number(value);
			else if (typeof value === 'boolean') endpoint[key] = value;
		});
	}

	function removeEndpoint(index: number, position: number): void {
		change(index, (row) => {
			row.endpoints.splice(position, 1);
		});
	}

	function addEndpoint(index: number): void {
		change(index, (row) => {
			row.endpoints.push({ url: '', priority: 0, allowPlaintext: false, verifyTls: true });
		});
	}

	function setPatterns(index: number, value: string): void {
		change(index, (row) => {
			row.allowedUrlPatterns = value
				.split('\n')
				.map((line) => line.trim())
				.filter(Boolean);
		});
	}
</script>
<template>
	<section class="space-y-4 min-w-0">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h2 class="text-sm font-semibold">{{ text.title }}</h2>
			<UiButton type="button" :disabled="disabled" @click="add">{{ text.add }}</UiButton>
		</div>
		<p v-if="!model.length" class="text-sm text-text-secondary">{{ text.empty }}</p>
		<article
			v-for="(target, index) in model"
			:key="index"
			class="target-card space-y-4 rounded-xl border border-border p-3"
		>
			<div class="flex items-end gap-2">
				<UiFormField class="min-w-0 flex-1" :label="text.id" :for-id="`target-${index}`">
					<UiInput
						:id="`target-${index}`"
						:model-value="target.id"
						:disabled="disabled"
						@update:model-value="setId(index, $event)"
					/>
				</UiFormField>
				<UiButton type="button" tone="danger" :disabled="disabled" @click="remove(index)">{{
					text.remove
				}}</UiButton>
			</div>
			<template v-for="(endpoint, position) in target.endpoints" :key="position">
				<div class="space-y-3 border-t border-border/50 pt-3">
					<UiFormField :label="text.endpoint" :for-id="`endpoint-${index}-${position}`">
						<UiInput
							:id="`endpoint-${index}-${position}`"
							:model-value="endpoint.url"
							:disabled="disabled"
							:placeholder="endpointPlaceholder"
							@update:model-value="setEndpoint(index, position, 'url', $event)"
						/>
					</UiFormField>
					<div class="flex items-end gap-2">
						<UiFormField
							class="min-w-0 flex-1"
							:label="text.priority"
							:for-id="`priority-${index}-${position}`"
						>
							<UiInput
								:id="`priority-${index}-${position}`"
								type="number"
								:min="0"
								:model-value="endpoint.priority"
								:disabled="disabled"
								@update:model-value="setEndpoint(index, position, 'priority', $event)"
							/>
						</UiFormField>
						<UiButton
							type="button"
							:disabled="disabled || target.endpoints.length === 1"
							@click="removeEndpoint(index, position)"
							>{{ text.remove }}</UiButton
						>
					</div>
					<div class="space-y-2">
						<div class="flex min-w-0 items-start gap-2">
							<UiCheckbox
								:id="`plaintext-${index}-${position}`"
								class="shrink-0"
								:aria-label="text.plaintext"
								:model-value="endpoint.allowPlaintext"
								:disabled="disabled"
								@update:model-value="setEndpoint(index, position, 'allowPlaintext', $event)"
							/>
							<label :for="`plaintext-${index}-${position}`" class="min-w-0 text-xs leading-6">{{
								text.plaintext
							}}</label>
						</div>
						<div class="flex min-w-0 items-start gap-2">
							<UiCheckbox
								:id="`tls-${index}-${position}`"
								class="shrink-0"
								:aria-label="text.tls"
								:model-value="endpoint.verifyTls"
								:disabled="disabled"
								@update:model-value="setEndpoint(index, position, 'verifyTls', $event)"
							/>
							<label :for="`tls-${index}-${position}`" class="min-w-0 text-xs leading-6">{{
								text.tls
							}}</label>
						</div>
					</div>
				</div>
			</template>
			<UiButton type="button" :disabled="disabled" @click="addEndpoint(index)">{{ text.addEndpoint }}</UiButton>
			<UiFormField :label="text.patterns" :for-id="`patterns-${index}`" :description="text.hint">
				<UiTextarea
					:id="`patterns-${index}`"
					:rows="3"
					:model-value="target.allowedUrlPatterns.join('\n')"
					:disabled="disabled"
					@update:model-value="setPatterns(index, $event)"
				/>
			</UiFormField>
		</article>
	</section>
</template>
