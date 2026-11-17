// Sign-in attempts per IP: 10 a minute.
// shortcut: counts live in this process, so they reset on restart and aren't shared between
// replicas. Move them to the database if the app ever runs more than one container.
const LIMIT = 10;
const WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; resetAt: number }>();

export function signInAllowed(key: string, now = Date.now()) {
	if (hits.size > 10_000) for (const [k, h] of hits) if (h.resetAt <= now) hits.delete(k);
	const hit = hits.get(key);
	if (!hit || hit.resetAt <= now) {
		hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
		return true;
	}
	return ++hit.count <= LIMIT;
}
