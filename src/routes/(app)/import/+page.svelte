<script lang="ts">
	import { untrack } from 'svelte';
	import { parse } from 'yaml';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import ErrorText from '$lib/components/app/ErrorText.svelte';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import SelectField from '$lib/components/app/SelectField.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { extractPdfText } from '$lib/pdf';
	import {
		isRecordYaml,
		planImport,
		recordsRoot,
		type EquipmentImport,
		type LogImport,
		type Problem
	} from '$lib/records';

	let { data } = $props();

	type Plan = ReturnType<typeof planImport>;
	type Task = {
		label: string;
		state: 'pending' | 'running' | 'done' | 'skipped' | 'failed';
		note?: string;
		run: () => Promise<string | void>;
	};

	let files = $state<Map<string, File>>(new Map());
	let plan = $state<Plan | null>(null);
	let pickError = $state('');
	let locationId = $state(untrack(() => (data.locations.length === 1 ? data.locations[0].id : '')));
	let tasks = $state<Task[]>([]);
	let running = $state(false);
	let finished = $state(false);

	const imported = $derived({
		equipment: new Set(data.imported.equipment),
		logs: new Set(data.imported.logs)
	});
	const newEquipment = $derived(
		plan?.equipment.filter((e) => !imported.equipment.has(e.key)) ?? []
	);
	const newLogs = $derived(plan?.logs.filter((l) => !imported.logs.has(l.key)) ?? []);
	const errors = $derived(plan?.problems.filter((p) => p.severity === 'error') ?? []);
	// Items added by hand aren't matched by the import, so the same name would appear twice.
	const sameName = $derived(
		newEquipment.filter((e) => data.handEntered.includes(e.name.trim().toLowerCase()))
	);
	const warnings = $derived([
		...(plan?.problems.filter((p) => p.severity === 'warning') ?? []),
		...sameName.map((e) => ({
			path: `equipment/${e.key}.yaml`,
			severity: 'warning' as const,
			message: `an item named ${e.name} was added by hand, so this adds a second one. Delete one afterwards, or rename it before importing.`
		}))
	]);
	const jobCount = $derived(newEquipment.reduce((n, e) => n + e.jobs.length, 0));
	const pdfs = $derived([...new Set(newEquipment.flatMap((e) => e.manualPdf ?? []))]);
	const photoCount = $derived(newLogs.reduce((n, l) => n + l.photos.length, 0));
	const counts = $derived({
		done: tasks.filter((t) => t.state === 'done').length,
		skipped: tasks.filter((t) => t.state === 'skipped').length,
		failed: tasks.filter((t) => t.state === 'failed').length
	});

	async function pick(e: Event & { currentTarget: HTMLInputElement }) {
		pickError = '';
		plan = null;
		tasks = [];
		finished = false;
		const picked = [...(e.currentTarget.files ?? [])];
		const root = recordsRoot(picked.map((f) => f.webkitRelativePath));
		if (root == null) {
			pickError = 'That folder has no equipment/ folder. Pick the records folder.';
			return;
		}
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built here, then assigned whole
		const byPath = new Map<string, File>();
		for (const f of picked) {
			if (f.webkitRelativePath.startsWith(root))
				byPath.set(f.webkitRelativePath.slice(root.length), f);
		}
		const problems: Problem[] = [];
		const entries: { path: string; data: unknown }[] = [];
		for (const [path, file] of byPath) {
			if (!isRecordYaml(path)) continue;
			try {
				entries.push({ path, data: parse(await file.text()) });
			} catch (err) {
				problems.push({ path, severity: 'error', message: `YAML: ${(err as Error).message}` });
			}
		}
		const result = planImport(entries, new Set(byPath.keys()));
		files = byPath;
		plan = { ...result, problems: [...problems, ...result.problems] };
	}

	async function post(action: string, body: FormData) {
		const response = await fetch(`?/${action}`, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		const result = deserialize(await response.text());
		if (result.type === 'success') return result.data as Record<string, unknown>;
		if (result.type === 'failure') throw new Error(String(result.data?.error ?? 'Failed'));
		if (result.type === 'error') throw new Error(result.error?.message ?? 'Server error');
		throw new Error('Unexpected response');
	}

	function equipmentTask(record: EquipmentImport, created: Set<string>): Task {
		return {
			label: record.name,
			state: 'pending',
			run: async () => {
				const body = new FormData();
				body.set('record', JSON.stringify(record));
				body.set('locationId', locationId);
				const result = await post('equipment', body);
				if (result.skipped) return 'skipped';
				created.add(record.key);
			}
		};
	}

	function manualTask(pdf: string, keys: () => string[]): Task {
		const task: Task = {
			label: `Manual ${pdf.replace('manuals/', '')}`,
			state: 'pending',
			run: async () => {
				const owners = keys();
				if (!owners.length) return 'skipped';
				const file = files.get(pdf)!;
				const text = await extractPdfText(file, (done, total) => {
					task.note = `Reading page ${done} of ${total}`;
				});
				task.note = 'Uploading';
				const body = new FormData();
				// Named by its file name alone; the manual's title comes from it.
				body.set('manual', new File([file], pdf.split('/').pop()!, { type: 'application/pdf' }));
				body.set('text', JSON.stringify(text));
				body.set('keys', JSON.stringify(owners));
				await post('manual', body);
				task.note = undefined;
			}
		};
		return task;
	}

	function logTask(record: LogImport): Task {
		return {
			label: `Log ${record.key}`,
			state: 'pending',
			run: async () => {
				const body = new FormData();
				body.set('record', JSON.stringify(record));
				body.set('captions', JSON.stringify(record.photos.map((p) => p.caption)));
				for (const photo of record.photos) body.append('photos', files.get(photo.path)!);
				const result = await post('log', body);
				if (result.skipped) return 'skipped';
			}
		};
	}

	async function run() {
		if (!plan) return;
		running = true;
		finished = false;
		// Manuals only go to items created in this run; an item imported before keeps its manual.
		const created = new Set<string>();
		const ownersOf = (pdf: string) => () =>
			newEquipment.filter((e) => e.manualPdf === pdf && created.has(e.key)).map((e) => e.key);
		tasks = [
			...newEquipment.map((e) => equipmentTask(e, created)),
			...pdfs.map((pdf) => manualTask(pdf, ownersOf(pdf))),
			...newLogs.map(logTask)
		];
		// One at a time, so each request stays small and a failure stops only that record.
		for (const task of tasks) {
			task.state = 'running';
			try {
				task.state = (await task.run()) === 'skipped' ? 'skipped' : 'done';
			} catch (err) {
				task.state = 'failed';
				task.note = (err as Error).message;
			}
		}
		running = false;
		finished = true;
		await invalidateAll();
	}
</script>

<svelte:window
	onbeforeunload={(e) => {
		if (running) e.preventDefault();
	}}
/>

<PageHeader title="Import records" back="/settings" />
<main class="mx-auto max-w-3xl space-y-6 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
	<p class="text-sm text-muted-foreground">
		Imports equipment, service schedules, logs, log pictures and manual PDFs from the
		cemetery-maintenance records folder (<code>maintenance/records</code>). Anything already
		imported is skipped, so it's safe to run again.
	</p>

	{#if !running}
		<label
			class="flex h-11 cursor-pointer items-center justify-center rounded-md border text-sm font-medium active:bg-muted"
		>
			{plan ? 'Pick a different folder' : 'Pick the records folder'}
			<input type="file" class="sr-only" multiple {...{ webkitdirectory: true }} onchange={pick} />
		</label>
		<ErrorText message={pickError} />
	{/if}

	{#if plan && !tasks.length}
		<section class="space-y-3">
			<h2 class="font-semibold">Preview</h2>
			<dl class="divide-y rounded-xl border text-sm">
				{#each [['Equipment', newEquipment.length, plan.equipment.length - newEquipment.length], ['Service jobs', jobCount, 0], ['Logs', newLogs.length, plan.logs.length - newLogs.length], ['Log pictures', photoCount, 0], ['Manual PDFs', pdfs.length, 0]] as [label, count, already] (label)}
					<div class="flex justify-between gap-4 p-3">
						<dt class="text-muted-foreground">{label}</dt>
						<dd class="font-medium">
							{count}
							{#if already}<span class="font-normal text-muted-foreground">
									· {already} already imported</span
								>{/if}
						</dd>
					</div>
				{/each}
			</dl>

			{#if errors.length}
				<div class="space-y-2">
					<h3 class="text-sm font-medium">
						{errors.length}
						{errors.length === 1 ? 'record has' : 'records have'} problems and won't be imported
					</h3>
					<ul class="space-y-2 text-sm">
						{#each errors as problem, i (i)}
							<li class="flex gap-2">
								<CircleX class="mt-0.5 size-4 shrink-0 text-destructive" />
								<span><code>{problem.path}</code>: {problem.message}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if warnings.length}
				<div class="space-y-2">
					<h3 class="text-sm font-medium">Imported with warnings</h3>
					<ul class="space-y-2 text-sm">
						{#each warnings as problem, i (i)}
							<li class="flex gap-2">
								<CircleAlert class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
								<span><code>{problem.path}</code>: {problem.message}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if newEquipment.length || newLogs.length}
				<div class="space-y-1.5">
					<Label for="locationId">Import into location</Label>
					<SelectField
						id="locationId"
						placeholder="Choose a location"
						options={data.locations.map((l) => ({ value: l.id, label: l.name }))}
						bind:value={locationId}
					/>
					{#if !data.locations.length}
						<p class="text-sm text-muted-foreground">
							<a href="/locations/new" class="underline">Add a location</a> first.
						</p>
					{/if}
				</div>
				<Button class="h-11 w-full" disabled={!locationId} onclick={run}>
					Import {newEquipment.length + newLogs.length} records{errors.length
						? ' and skip the rest'
						: ''}
				</Button>
			{:else}
				<p class="text-sm text-muted-foreground">Everything in this folder is already imported.</p>
			{/if}
		</section>
	{/if}

	{#if tasks.length}
		<section class="space-y-3">
			<h2 class="font-semibold">
				{#if running}Importing…{:else}Done: {counts.done} imported{counts.skipped
						? `, ${counts.skipped} skipped`
						: ''}{counts.failed ? `, ${counts.failed} failed` : ''}{/if}
			</h2>
			{#if running}
				<p class="text-sm text-muted-foreground">Keep this page open until it finishes.</p>
			{/if}
			{#if finished}
				<div class="flex gap-2">
					<Button href="/" variant="outline" class="h-11 flex-1">Equipment</Button>
					<Button href="/due" class="h-11 flex-1">See what's due</Button>
				</div>
				{#if counts.failed}
					<p class="text-sm text-muted-foreground">
						Failed records weren't saved. Fix them and pick the folder again to retry.
					</p>
				{/if}
			{/if}
			<ul class="divide-y rounded-xl border text-sm">
				{#each tasks as task, i (i)}
					<li class="flex gap-2 p-3">
						{#if task.state === 'running'}
							<LoaderCircle class="mt-0.5 size-4 shrink-0 animate-spin" />
						{:else if task.state === 'done'}
							<CircleCheck class="mt-0.5 size-4 shrink-0" />
						{:else if task.state === 'failed'}
							<CircleX class="mt-0.5 size-4 shrink-0 text-destructive" />
						{:else}
							<span class="size-4 shrink-0"></span>
						{/if}
						<span class="min-w-0 flex-1">
							<span class="block truncate">{task.label}</span>
							{#if task.note}<span class="block text-muted-foreground">{task.note}</span>{/if}
							{#if task.state === 'skipped'}
								<span class="block text-muted-foreground">Already imported</span>
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>
