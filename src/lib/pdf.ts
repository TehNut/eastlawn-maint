// pdf.js is large, so it only loads on pages that handle a PDF. The legacy build keeps it working
// on the older phones that are common in the field.
export async function loadPdfjs() {
	const [pdfjs, worker] = await Promise.all([
		import('pdfjs-dist/legacy/build/pdf.mjs'),
		import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
	]);
	pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
	return pdfjs;
}

// Extracting here means the server spends no CPU on parsing PDFs.
export async function extractPdfText(
	file: File,
	onProgress: (done: number, total: number) => void
) {
	const pdfjs = await loadPdfjs();
	const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
	const pdf = await task.promise;
	const pages: { page: number; text: string }[] = [];
	for (let n = 1; n <= pdf.numPages; n++) {
		const page = await pdf.getPage(n);
		const content = await page.getTextContent();
		const text = content.items
			.map((item) => ('str' in item ? item.str + (item.hasEOL ? ' ' : '') : ''))
			.join(' ');
		if (text.trim()) pages.push({ page: n, text });
		page.cleanup();
		onProgress(n, pdf.numPages);
	}
	const pageCount = pdf.numPages;
	await task.destroy();
	return { pageCount, pages };
}
