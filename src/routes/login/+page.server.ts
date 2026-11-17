import { fail, redirect } from '@sveltejs/kit';
import { isAPIError } from 'better-auth/api';
import { count } from 'drizzle-orm';
import { user } from '$lib/server/db/schema';
import { signInAllowed } from '$lib/server/rate-limit';

// Same-origin paths only, so a crafted link can't bounce users off-site after login.
const safeNext = (url: URL) => {
	const raw = url.searchParams.get('next') ?? '/';
	return /^\/(?![/\\])/.test(raw) ? raw : '/';
};

export const load = async ({ locals, url }) => {
	if (locals.user) redirect(303, safeNext(url));

	const [{ total }] = await locals.db.select({ total: count() }).from(user);
	if (total === 0) redirect(303, '/setup');
};

// A form action rather than a client-side call, so signing in works (and shows its errors) even
// before the page's JS has loaded, e.g. on a phone over a slow link.
export const actions = {
	default: async ({ request, locals, url, getClientAddress }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '');
		if (!signInAllowed(getClientAddress())) {
			return fail(429, { email, error: 'Too many sign-in attempts. Wait a minute and try again.' });
		}
		try {
			await locals.auth.api.signInEmail({
				body: { email, password: String(form.get('password') ?? '') },
				headers: request.headers
			});
		} catch (e) {
			if (!isAPIError(e)) throw e;
			return fail(e.statusCode, { email, error: e.body?.message ?? 'Could not sign in' });
		}
		redirect(303, safeNext(url));
	}
};
