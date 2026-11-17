import type { Permission } from '$lib/permissions';
import type { Auth } from '$lib/server/auth';
import type { Db } from '$lib/server/db';

declare global {
	namespace App {
		interface Locals {
			db: Db;
			auth: Auth;
			user: {
				id: string;
				name: string;
				email: string;
				permissions: Permission[];
				locationId: string | null;
			} | null;
		}
		// Shallow routing: the photo open in a lightbox, so Back closes it.
		interface PageState {
			photo?: string;
		}
	}
	// Runtime config, from $env/dynamic/private.
	type Env = typeof import('$env/dynamic/private').env;
}

export {};
