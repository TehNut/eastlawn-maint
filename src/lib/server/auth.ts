import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import type { Db } from './db';
import * as schema from './db/schema';

const scryptAsync = promisify<string, Buffer, number, object, Buffer>(scrypt);
const SCRYPT = { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 };

// better-auth's default hasher runs scrypt in JS. node:crypto's is native and much faster.
async function hashPassword(password: string) {
	const salt = randomBytes(16);
	const key = await scryptAsync(password.normalize('NFKC'), salt, 64, SCRYPT);
	return `${salt.toString('hex')}:${key.toString('hex')}`;
}

async function verifyPassword({ hash, password }: { hash: string; password: string }) {
	const [salt, key] = hash.split(':');
	const expected = Buffer.from(key, 'hex');
	const actual = await scryptAsync(
		password.normalize('NFKC'),
		Buffer.from(salt, 'hex'),
		64,
		SCRYPT
	);
	return timingSafeEqual(actual, expected);
}

// Created per request so baseURL follows the request's origin.
export function createAuth(db: Db, env: Env, baseURL: string) {
	return betterAuth({
		baseURL,
		secret: env.BETTER_AUTH_SECRET,
		database: drizzleAdapter(db, { provider: 'sqlite', schema }),
		emailAndPassword: {
			enabled: true,
			// Accounts are only created through $lib/server/users.
			disableSignUp: true,
			password: { hash: hashPassword, verify: verifyPassword }
		},
		// Returned with the session, which reads the user row on every request anyway, so flag
		// changes apply straight away. input: false stops users setting them through the auth API;
		// no defaultValue, so better-auth never writes them (the database default does).
		user: {
			additionalFields: {
				permissions: { type: 'string[]', required: false, input: false },
				locationId: { type: 'string', required: false, input: false }
			}
		},
		// Long-lived so scanning a QR label in the field doesn't hit a login screen.
		session: { expiresIn: 60 * 60 * 24 * 60, updateAge: 60 * 60 * 24 },
		plugins: [sveltekitCookies(getRequestEvent)]
	});
}

export type Auth = ReturnType<typeof createAuth>;
