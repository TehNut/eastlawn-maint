// No $lib or platform imports, so tests can load it.

// One HTTP byte range (bytes=a-b, bytes=a-, bytes=-n) as inclusive offsets, or null when the
// header is missing, malformed, multi-range or unsatisfiable, so the caller sends the whole file.
export function parseRange(header: string, size: number) {
	const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!m || (!m[1] && !m[2])) return null;
	const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
	const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
	return start <= end && start < size ? { start, end } : null;
}
