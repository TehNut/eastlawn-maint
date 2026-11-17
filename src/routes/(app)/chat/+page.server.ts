import { requirePermission } from '$lib/server/access';

export const load = ({ locals }) => {
	requirePermission(locals, 'ai.use');
};
