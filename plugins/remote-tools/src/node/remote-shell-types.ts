/** Prompt integration callbacks supplied by the owner of the SSH connection. */
export interface RemoteShellOptions {
	write(bytes: Uint8Array): void;
	execute(command: string, signal?: AbortSignal): Promise<string>;
	onPrompt(): void;
}
