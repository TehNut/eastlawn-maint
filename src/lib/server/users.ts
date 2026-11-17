import { eq } from 'drizzle-orm';
import { can, type Permission } from '$lib/permissions';
import type { Auth } from './auth';
import type { Db } from './db';
import { location, user } from './db/schema';

type NewUser = { name: string; email: string; password: string };

// Public sign-up is disabled, so this is the only way accounts are made.
export async function createUser(
	auth: Auth,
	db: Db,
	{ name, email, password }: NewUser,
	permissions: Permission[],
	locationId: string | null = null
) {
	const ctx = await auth.$context;
	const normalized = email.toLowerCase();
	if (await ctx.internalAdapter.findUserByEmail(normalized)) return null;

	const created = await ctx.internalAdapter.createUser(
		{ name, email: normalized, emailVerified: true },
		{ method: 'email-password' }
	);
	await ctx.internalAdapter.linkAccount({
		userId: created.id,
		providerId: 'credential',
		accountId: created.id,
		password: await ctx.password.hash(password)
	});
	await db.update(user).set({ permissions, locationId }).where(eq(user.id, created.id));
	return created;
}

// The location an admin picked. Admins see everything, so restricting one would mean nothing.
// Undefined means the id doesn't exist, which must fail rather than fall back to no restriction.
export async function chosenLocation(db: Db, form: FormData, permissions: Permission[]) {
	const id = String(form.get('locationId') ?? '');
	if (!id || can({ permissions }, 'admin')) return null;
	const [found] = await db.select({ id: location.id }).from(location).where(eq(location.id, id));
	return found?.id;
}

export async function resetPassword(auth: Auth, userId: string, password: string) {
	const ctx = await auth.$context;
	await ctx.internalAdapter.updatePassword(userId, await ctx.password.hash(password));
	await ctx.internalAdapter.deleteUserSessions(userId);
}
