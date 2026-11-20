import { WorkspaceError } from './workspace-error';

/** RFC 9110 single byte ranges. Reject invalid/unsatisfiable requests, never silently restart a partial download. */
export function selectDownloadRange(header: string | undefined, size: number) {
	if (header === undefined) return null;
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());

	const invalid = () => {
		throw new WorkspaceError('WORKSPACE_DOWNLOAD_RANGE_INVALID', 416);
	};

	if (!match || (!match[1] && !match[2]) || size === 0) return invalid();
	const suffix = match[1] === '';
	const start = suffix ? Math.max(0, size - Number(match[2])) : Number(match[1]);
	const end = suffix || !match[2] ? size - 1 : Math.min(Number(match[2]), size - 1);
	if (
		!Number.isSafeInteger(start) ||
		!Number.isSafeInteger(end) ||
		(suffix && Number(match[2]) <= 0) ||
		start < 0 ||
		start >= size ||
		end < start
	)
		return invalid();
	return { start, end };
}
