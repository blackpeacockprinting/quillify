import { Refused } from './refusal.js';
import type { PDFDocumentProxy } from 'pdfjs-dist';

// Held in a constant so that Vite copies the worker byte for byte. Written
// inside `new Worker(...)`, the URL makes it bundle the file again.
const WORKER = new URL('../assets/pdf.worker.js', import.meta.url);

// The shipped worker rejects an open with what pdf.js's XFA layout threw, under
// this prefix.
const LAYOUT = 'XFA layout: ';

/**
 * A document on a worker of its own, which `close` ends. A file pdf.js rejects
 * is refused here, so it carries the same code whichever stage opens it.
 *
 * A worker that is busy when `signal` fires answers nothing more, so a
 * question put to the document is awaited through `within`, which rejects
 * with the signal's reason then.
 */
export async function openPdf(
	bytes: Uint8Array,
	options: { enableXfa?: boolean; ownerDocument?: Document } = {},
	signal?: AbortSignal
): Promise<{
	pdf: PDFDocumentProxy;
	close(): Promise<void>;
	within<T>(asked: Promise<T>): Promise<T>;
}> {
	const pdfjs = await import('pdfjs-dist');
	signal?.throwIfAborted();
	const port = new Worker(WORKER, { type: 'module' });
	const worker = pdfjs.PDFWorker.create({ port });
	const task = pdfjs.getDocument({ data: bytes.slice(), ...options, worker });

	// A worker script that fails to load answers nothing, and neither does one
	// that is busy when the signal fires. `task.destroy()` waits on an answer,
	// and `close` ends the worker whatever that wait comes to.
	let answers = true;
	const silent = Promise.withResolvers<never>();
	const give = (reason: unknown) => {
		answers = false;
		silent.reject(reason);
	};
	port.onerror = () => give(new Error(`pdf.worker.js did not load from ${WORKER}`));
	const late = () => give(signal?.reason);
	signal?.addEventListener('abort', late);
	const within = <T>(asked: Promise<T>) => Promise.race([asked, silent.promise]);
	const close = async () => {
		const destroyed = task.destroy();
		if (answers) await within(destroyed).catch(() => {});
		signal?.removeEventListener('abort', late);
		worker.destroy();
		port.terminate();
	};

	try {
		return { pdf: await within(task.promise), close, within };
	} catch (err) {
		await close();
		if (!answers) throw err;
		if (err instanceof pdfjs.PasswordException) throw new Refused({ code: 'password' });
		if (err instanceof pdfjs.InvalidPDFException) throw new Refused({ code: 'not_pdf' });
		if (err instanceof Error && err.message.startsWith(LAYOUT))
			throw new Refused({ code: 'layout', detail: err.message.slice(LAYOUT.length) });
		// pdf.js raises a plain Error for an encryption it does not know, which is
		// what a certificate-based PubSec file looks like.
		if (err instanceof Error && /encryp/i.test(err.message))
			throw new Refused({ code: 'encryption' });
		throw err;
	}
}
