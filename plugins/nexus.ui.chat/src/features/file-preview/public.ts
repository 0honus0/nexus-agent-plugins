export const loadFilePreview = () => import('@/features/file-preview/components/FilePreview.vue');

export { previewInlineLimit, previewKindFor } from '@/features/file-preview/providers/previewRegistry';

export { createFilePreviewSession, useFilePreviewTabs } from '@/features/file-preview/composables/useFilePreviewTabs';

export type {
	FilePreviewSessionController,
	FilePreviewOpenContext,
} from '@/features/file-preview/composables/useFilePreviewTabs';

export type {
	FilePreviewReadOptions,
	FilePreviewReadResult,
	FilePreviewSource,
} from '@/features/file-preview/ports/file-preview-source';

export type { PreviewError, PreviewFile, PreviewKind, PreviewTab } from '@/features/file-preview/model/preview';
