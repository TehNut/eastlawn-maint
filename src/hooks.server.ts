import { error, redirect, type Handle } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import { createAuth } from '$lib/server/auth';
import { requireRouteInLocation } from '$lib/server/access';
import { env } from '$env/dynamic/private';
import { openDb, type Db } from '$lib/server/db';
import { signInAllowed } from '$lib/server/rate-limit';
import type { Permission } from '$lib/permissions';

const isPublic = (path: string) =>
	path === '/login' || path === '/setup' || path.startsWith('/api/auth/');

// One connection for the process, opened (and migrated) on the first request.
let db: Promise<Db> | undefined;

export const handle: Handle = async ({ event, resolve }) => {
	if (building) return resolve(event);

	// The login page's form action does its own check, so its error shows inline.
	if (
		event.url.pathname.startsWith('/api/auth/sign-in') &&
		!signInAllowed(event.getClientAddress())
	) {
		error(429, 'Too many sign-in attempts. Wait a minute and try again.');
	}
	const conn = await (db ??= openDb());
	const auth = createAuth(conn, env, event.url.origin);

	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.db = conn;
	event.locals.auth = auth;
	event.locals.user = null;
	if (session) {
		event.locals.user = {
			...session.user,
			permissions: (session.user.permissions ?? []) as Permission[],
			locationId: session.user.locationId ?? null
		};
	}

	// Everything is private by default, so a new route can't be left exposed by accident.
	if (!event.locals.user && !isPublic(event.url.pathname)) {
		if (event.url.pathname.startsWith('/api/')) error(401, 'Sign in required');
		const next = event.url.pathname + event.url.search;
		redirect(303, `/login?next=${encodeURIComponent(next)}`);
	}

	await requireRouteInLocation(event);

	return svelteKitHandler({ event, resolve, auth, building });
};
