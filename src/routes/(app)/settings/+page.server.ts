import { env } from '$env/dynamic/private';
import { fail } from '@sveltejs/kit';
import { can } from '$lib/permissions';
import { requirePermission } from '$lib/server/access';
import { aiModels } from '$lib/server/ai';
import { currentModel, saveModel } from '$lib/server/settings';

export const load = async ({ locals }) => {
	requirePermission(locals, 'admin', 'users.create');
	return {
		ai: can(locals.user, 'admin')
			? {
					models: aiModels(env),
					model: await currentModel(locals.db, env)
				}
			: null
	};
};

export const actions = {
	model: async ({ request, locals }) => {
		requirePermission(locals, 'admin');
		const model = String((await request.formData()).get('model'));
		if (!aiModels(env).includes(model)) return fail(400, { error: 'Unknown model' });
		await saveModel(locals.db, model);
	}
};
