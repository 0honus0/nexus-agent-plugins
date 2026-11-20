declare module 'virtual:workspace-file-icons' {
	const manifest: import('material-icon-theme').Manifest;
	export const inlineIcons: Readonly<Record<string, string | undefined>>;
	export default manifest;
}
