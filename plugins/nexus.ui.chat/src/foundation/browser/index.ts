export { isMobileUserAgent, useDeviceCapabilities } from '@/foundation/browser/useDeviceCapabilities';

export type { DeviceCapabilities } from '@/foundation/browser/useDeviceCapabilities';

export { writeClipboardText } from '@/foundation/browser/clipboard';

export {
	booleanStorageCodec,
	browserStorageKey,
	jsonStorageCodec,
	numberStorageCodec,
	readStoredValue,
	removeLegacyStorageKeys,
	removeStoredValue,
	stringStorageCodec,
	writeStoredValue,
} from '@/foundation/browser/storage';

export type {
	BrowserStorageArea,
	BrowserStorageCodec,
	BrowserStorageDefinition,
	BrowserStorageScope,
} from '@/foundation/browser/storage';
