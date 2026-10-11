import { Refused } from './refusal.js';
import type { PDFDocumentProxy } from 'pdfjs-dist';

// Held in a constant so that Vite copies the worker byte for byte. Written
// inside `new Worker(...)`, the URL makes it bundle the file again.
const WORKER = new URL('../assets/pdf.worker.js', import.meta.url);

/**
 * A document on a worker of its own, which `close` ends. A file pdf.js rejects
 * is refused here, so it carries the same code whichever stage opens it.
 */
export async function openPdf(
	bytes: Uint8Array,
	options: { enableXfa?: boolean; ownerDocument?: Document } = {}
): Promise<{ pdf: PDFDocumentProxy; close(): Promise<void> }> {
	const pdfjs = await import('pdfjs-dist');
	const port = new Worker(WORKER, { type: 'module' });
	const worker = pdfjs.PDFWorker.create({ port });
	const task = pdfjs.getDocument({ data: bytes.slice(), ...options, worker });

	// A worker script that fails to load answers nothing, and `task.destroy()`
	// waits on an answer.
	let answers = true;
	const unloaded = new Promise<never>((_, reject) => {
		port.onerror = () => {
			answers = false;
			reject(new Error(`pdf.worker.js did not load from ${WORKER}`));
		};
	});
	const close = async () => {
		const destroyed = task.destroy();
		if (answers) await destroyed;
		worker.destroy();
		port.terminate();
	};

	try {
		return { pdf: await Promise.race([task.promise, unloaded]), close };
	} catch (err) {
		await close();
		if (!answers) throw err;
		if (err instanceof pdfjs.PasswordException) throw new Refused({ code: 'password' });
		if (err instanceof pdfjs.InvalidPDFException) throw new Refused({ code: 'not_pdf' });
		// pdf.js raises a plain Error for an encryption it does not know, which is
		// what a certificate-based PubSec file looks like.
		if (err instanceof Error && /encryp/i.test(err.message))
			throw new Refused({ code: 'encryption' });
		throw err;
	}
}
