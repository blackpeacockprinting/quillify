import { Refused } from './refusal.js';
import type { PDFDocumentLoadingTask } from 'pdfjs-dist';

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
 * The task returned holds an opened document. A file pdf.js rejects is refused
 * here, so it carries the same code whichever stage opens it.
 */
export async function openPdf(
	bytes: Uint8Array,
	options: { enableXfa?: boolean } = {}
): Promise<PDFDocumentLoadingTask> {
	const pdfjs = await loadPdfjs();
	const task = pdfjs.getDocument({ data: bytes.slice(), ...options });
	try {
		await task.promise;
	} catch (err) {
		await task.destroy();
		if (err instanceof pdfjs.PasswordException) throw new Refused({ code: 'password' });
		if (err instanceof pdfjs.InvalidPDFException) throw new Refused({ code: 'not_pdf' });
		// pdf.js raises a plain Error for an encryption it does not know, which is
		// what a certificate-based PubSec file looks like.
		if (err instanceof Error && /encryp/i.test(err.message))
			throw new Refused({ code: 'encryption' });
		throw err;
	}
	return task;
}
