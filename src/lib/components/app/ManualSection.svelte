<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { extractPdfText } from '$lib/pdf';
	import ErrorText from './ErrorText.svelte';
	import SelectField from './SelectField.svelte';

	let {
		current,
		manuals,
		error
	}: {
		current: { id: string; name: string; chunkCount: number } | null;
		manuals: { id: string; name: string }[];
		error?: string;
	} = $props();

	let status = $state('');
	let readError = $state('');
	let text = $state('');
	let form = $state<HTMLFormElement>();
	let input = $state<HTMLInputElement>();
	let existing = $state('');

	async function onchange() {
		const file = input!.files?.[0];
		if (!file) return;
		readError = '';
		status = 'Reading PDF…';
		try {
			const result = await extractPdfText(file, (done, total) => {
				status = `Reading page ${done} of ${total}…`;
			});
			text = JSON.stringify(result);
			status = 'Uploading…';
			// The hidden field has to render before the form is sent.
			await tick();
			form!.requestSubmit();
		} catch {
			status = '';
			readError = "That PDF couldn't be read. It may be damaged or password protected.";
		}
	}
</script>

<section class="space-y-3">
	<h2 class="font-semibold">Operator manual</h2>

	{#if current}
		<div class="flex items-center gap-2 rounded-xl border p-3 text-sm">
			<a href="/manuals/{current.id}" class="min-w-0 flex-1 truncate font-medium underline">
				{current.name}
			</a>
			<form method="POST" action="?/removeManual" use:enhance>
				<Button type="submit" variant="outline" size="sm">Remove</Button>
			</form>
		</div>
		{#if current.chunkCount === 0}
			<p class="text-sm text-muted-foreground">
				This looks like a scanned PDF with no text, so people can read it but the AI can't search
				it.
			</p>
		{/if}
	{/if}

	<form
		bind:this={form}
		method="POST"
		action="?/uploadManual"
		enctype="multipart/form-data"
		use:enhance={() =>
			async ({ update }) => {
				await update();
				status = '';
				text = '';
			}}
	>
		<input type="hidden" name="text" value={text} />
		<label
			class="flex h-11 cursor-pointer items-center justify-center rounded-md border text-sm font-medium active:bg-muted {status
				? 'pointer-events-none opacity-60'
				: ''}"
		>
			{status || (current ? 'Replace with a PDF' : 'Upload a PDF')}
			<input
				bind:this={input}
				{onchange}
				type="file"
				name="manual"
				accept="application/pdf,.pdf"
				class="sr-only"
			/>
		</label>
	</form>

	{#if manuals.length}
		<form method="POST" action="?/linkManual" use:enhance class="space-y-1.5">
			<Label for="manualId">Or use one already uploaded</Label>
			<div class="flex gap-2">
				<SelectField
					id="manualId"
					name="manualId"
					placeholder="Choose a manual"
					options={manuals.map((m) => ({ value: m.id, label: m.name }))}
					bind:value={existing}
				/>
				<Button type="submit" variant="outline" class="h-11" disabled={!existing}>Use</Button>
			</div>
		</form>
	{/if}

	<ErrorText message={readError || error} />
</section>
