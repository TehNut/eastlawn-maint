import { createAuthClient } from 'better-auth/svelte';
import { goto } from '$app/navigation';
import { forgetShapes } from 'skullet';

export const authClient = createAuthClient();

export async function signOut() {
	await authClient.signOut();
	forgetShapes();
	await goto('/login', { invalidateAll: true });
}
