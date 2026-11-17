import { eq } from 'drizzle-orm';
import { aiModels } from './ai';
import type { Db } from './db';
import { setting } from './db/schema';

const AI_MODEL = 'ai_model';

// AI_MODELS stays the allow-list, so a model removed from it stops being used straight away.
export async function currentModel(db: Db, env: Env) {
	const models = aiModels(env);
	const [row] = await db.select().from(setting).where(eq(setting.key, AI_MODEL));
	const saved = row?.value;
	return saved && models.includes(saved) ? saved : models[0];
}

export async function saveModel(db: Db, model: string) {
	await db
		.insert(setting)
		.values({ key: AI_MODEL, value: model })
		.onConflictDoUpdate({ target: setting.key, set: { value: model } });
}
