const MAX_SIDE = 1600;

// Phone photos are huge; shrink them before upload. Falls back to the original
// if the browser can't decode the format.
export async function compressImage(file: File): Promise<File> {
	try {
		const bitmap = await createImageBitmap(file);
		const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(bitmap.width * scale);
		canvas.height = Math.round(bitmap.height * scale);
		canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		bitmap.close();
		const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.8));
		if (!blob) return file;
		return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
	} catch {
		return file;
	}
}
