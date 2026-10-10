import { PdfImportRefusal } from './inventory.js';
import type { PDFDocumentLoadingTask } from 'pdfjs-dist';

/**
 * Where the copy of `pdfjs-dist/wasm/` lands. `vite.config.ts` puts it there;
 * pdf.js appends a filename, so the trailing slash is required.
 */
const WASM_URL = '/pdfjs/wasm/';

/** pdf.js, loaded on first use with its worker as a module worker of this bundle. */
export async function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
	const pdfjs = await import('pdfjs-dist');
	pdfjs.GlobalWorkerOptions.workerPort ??= new Worker(
		new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url),
		{ type: 'module' }
	);
	return pdfjs;
}

/**
 * Open a PDF for reading. Every caller goes through here so the codec wasm is
 * always reachable: without `wasmUrl` a JBIG2-encoded scan decodes to nothing
 * and the page rasterizes white, which the naming pass then reads as a blank
 * sheet and answers about anyway. SF 144 is one such file.
 *
 * The task returned holds an opened document. A file pdf.js rejects is refused
 * here, so every reader words a locked or damaged file the same way.
 */
export async function openPdf(
	bytes: Uint8Array,
	options: { enableXfa?: boolean } = {}
): Promise<PDFDocumentLoadingTask> {
	const pdfjs = await loadPdfjs();
	const task = pdfjs.getDocument({ data: bytes.slice(), wasmUrl: WASM_URL, ...options });
	try {
		await task.promise;
	} catch (err) {
		await task.destroy();
		if (err instanceof pdfjs.PasswordException)
			throw new PdfImportRefusal('This PDF is password protected. Remove the password first.');
		if (err instanceof pdfjs.InvalidPDFException)
			throw new PdfImportRefusal('This file is not a PDF the reader can open.');
		// pdf.js raises a plain Error for an encryption it does not know, which is
		// what a certificate-based PubSec file looks like.
		if (err instanceof Error && /encryp/i.test(err.message))
			throw new PdfImportRefusal(
				'This PDF uses an encryption this app cannot open, which is usually a certificate-based one. Save an unencrypted copy and try that.'
			);
		throw err;
	}
	return task;
}
