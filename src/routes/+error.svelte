<script lang="ts">
	import { page } from '$app/state';
</script>

<main class="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
	<h1 class="text-xl font-semibold">
		{page.status === 403 ? 'No access' : page.status === 404 ? 'Not found' : 'Something went wrong'}
	</h1>
	<p class="text-muted-foreground">{page.error?.message}</p>
	<a href="/" class="mt-2 font-medium underline">Back to equipment</a>
</main>
