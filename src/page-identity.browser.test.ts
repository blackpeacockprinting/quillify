/**
 * Of what a page shows, the strip takes its annotations and nothing else. So
 * with no annotation drawn, pdf.js paints a background as it paints the file
 * the strip was given, page for page and pixel for pixel. For a dynamic form
 * that file is the redraw `xfaToAcroForm` made.
 */

import { expect, it } from 'vitest';
import { inventoryPdf } from './inventory.js';
import { normalizePdf } from './normalize.js';
import { stripAcroForm } from './strip.js';
import { xfaToAcroForm } from './xfa.js';

const fixtures = import.meta.glob<string>('../test/fixtures/*.pdf', {
	query: '?url',
	import: 'default',
	eager: true
});
const WORKER = new URL('../assets/pdf.worker.js', import.meta.url);

async function painted(bytes: Uint8Array) {
	const { AnnotationMode, PDFWorker, getDocument } = await import('pdfjs-dist');
	const port = new Worker(WORKER, { type: 'module' });
	const worker = PDFWorker.create({ port });
	const task = getDocument({
		// pdf.js takes the buffer it is handed, so it gets a copy.
		data: bytes.slice(),
		wasmUrl: '/node_modules/pdfjs-dist/wasm/',
		worker
	});
	try {
		const pdf = await task.promise;
		const pages: { width: number; height: number; pixels: Uint32Array }[] = [];
		for (let number = 1; number <= pdf.numPages; number++) {
			const page = await pdf.getPage(number);
			const viewport = page.getViewport({ scale: 1 });
			const canvas = document.createElement('canvas');
			canvas.width = Math.ceil(viewport.width);
			canvas.height = Math.ceil(viewport.height);
			await page.render({ canvas, viewport, annotationMode: AnnotationMode.DISABLE }).promise;
			const { width, height } = canvas;
			const rgba = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
			pages.push({ width, height, pixels: new Uint32Array(rgba.buffer) });
		}
		return pages;
	} finally {
		await task.destroy();
		worker.destroy();
		port.terminate();
	}
}

for (const [path, url] of Object.entries(fixtures)) {
	const name = path.slice(path.lastIndexOf('/') + 1).replace(/(_.*)?\.pdf$/, '');
	it(`${name}: the background paints as the file it was stripped from, pixel for pixel`, async () => {
		const fetched = new Uint8Array(await (await fetch(url)).arrayBuffer());
		const source = await xfaToAcroForm(await normalizePdf(fetched));
		const before = await painted(source);
		const { views } = await inventoryPdf(source);
		const after = await painted(await stripAcroForm(source, views));

		expect(after.length, 'pages').toBe(before.length);
		for (const [index, page] of before.entries()) {
			const at = `page ${index + 1}`;
			// SF 144's pages are JBIG2 scans, which pdf.js paints blank when it cannot
			// fetch its image codecs from `wasmUrl`, and a blank page equals a blank page.
			expect(
				page.pixels.some((pixel) => pixel !== 0xffffffff),
				`${at} has ink`
			).toBe(true);
			expect([after[index].width, after[index].height], `${at} size`).toEqual([
				page.width,
				page.height
			]);
			expect(
				after[index].pixels.filter((pixel, i) => pixel !== page.pixels[i]).length,
				`${at} pixels that differ`
			).toBe(0);
		}
	}, 120_000);
}
