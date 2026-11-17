import { env } from '$env/dynamic/private';
import { createHash, timingSafeEqual } from 'node:crypto';
import { fail, redirect } from '@sveltejs/kit';
import { count } from 'drizzle-orm';
import { user } from '$lib/server/db/schema';
import { parseNewUser } from '$lib/server/forms';
import { createUser } from '$lib/server/users';

const digest = (value: string) => createHash('sha256').update(value).digest();
const hasUsers = async (locals: App.Locals) => {
	const [{ total }] = await locals.db.select({ total: count() }).from(user);
	return total > 0;
};

export const load = async ({ locals }) => {
	if (await hasUsers(locals)) redirect(303, '/login');
};

export const actions = {
	default: async ({ request, locals }) => {
		if (await hasUsers(locals)) redirect(303, '/login');

		const form = await request.formData();
		const expected = env.SETUP_TOKEN;
		const token = String(form.get('token') ?? '');
		if (!expected || !timingSafeEqual(digest(token), digest(expected))) {
			return fail(403, { error: 'Incorrect setup code' });
		}
		const parsed = parseNewUser(form);
		if (!parsed.success) return fail(400, { error: parsed.error });

		await createUser(locals.auth, locals.db, parsed.data, ['admin']);
		await locals.auth.api.signInEmail({
			body: { email: parsed.data.email, password: parsed.data.password }
		});
		redirect(303, '/');
	}
};
