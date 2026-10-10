/**
 * Every read runs on a pdf.js worker of its own, the guarded one the package
 * ships. A host page that runs pdf.js too keeps its worker, and its settings
 * decide nothing here.
 */

import { GlobalWorkerOptions, PDFWorker } from 'pdfjs-dist';
import { afterEach, expect, it, vi } from 'vitest';
import { commands } from 'vitest/browser';
import reserveUrl from '../test/fixtures/DAF1288_Application_for_Ready_Reserve_Assignment.pdf?url';
import { openPdf } from './pdfjs.js';
import { Refused } from './refusal.js';
import { sanitize } from './sanitize.js';

const reserve = async () => new Uint8Array(await (await fetch(reserveUrl)).arrayBuffer());

afterEach(() => {
	vi.unstubAllGlobals();
	GlobalWorkerOptions.workerPort = null;
	GlobalWorkerOptions.workerSrc = '';
});

function countWorkers() {
	const count = { started: 0, live: new Set<Worker>() };
	vi.stubGlobal(
		'Worker',
		class extends Worker {
			constructor(url: string | URL, options?: WorkerOptions) {
				super(url, options);
				count.live.add(this);
				count.started++;
			}
			terminate() {
				count.live.delete(this);
				super.terminate();
			}
		}
	);
	return count;
}

it('ends every worker a read starts', async () => {
	const count = countWorkers();

	expect((await sanitize(await reserve())).ok).toBe(true);
	expect(count.started).toBeGreaterThan(0);
	expect(count.live.size).toBe(0);
}, 60_000);

it('ends the worker of an open it refuses', async () => {
	const count = countWorkers();

	await expect(openPdf(new TextEncoder().encode('just words'))).rejects.toBeInstanceOf(Refused);
	expect(count.started).toBe(1);
	expect(count.live.size).toBe(0);
}, 60_000);

it('destroys the task and the PDFWorker of a document it closes', async () => {
	const create = vi.spyOn(PDFWorker, 'create');
	const { pdf, close } = await openPdf(await reserve());
	const worker = create.mock.results[0].value as PDFWorker;
	create.mockRestore();
	expect([pdf.loadingTask.destroyed, worker.destroyed]).toEqual([false, false]);

	await close();
	expect([pdf.loadingTask.destroyed, worker.destroyed]).toEqual([true, true]);
}, 60_000);

it('converts DAF 1288 when the worker the host gave pdf.js never answers', async () => {
	const silent = new Worker(URL.createObjectURL(new Blob([''])));
	GlobalWorkerOptions.workerPort = silent;
	GlobalWorkerOptions.workerSrc = '/host/pdf.worker.mjs';

	const sanitized = await sanitize(await reserve());
	expect(sanitized.ok && sanitized.form.fields).toHaveLength(116);
	expect(GlobalWorkerOptions.workerPort).toBe(silent);
	expect(GlobalWorkerOptions.workerSrc).toBe('/host/pdf.worker.mjs');
	silent.terminate();
}, 60_000);

it('gives pdf.js no global worker where the host set none', async () => {
	expect((await sanitize(await reserve())).ok).toBe(true);
	expect(GlobalWorkerOptions.workerPort).toBeNull();
	expect(GlobalWorkerOptions.workerSrc).toBe('');
}, 60_000);

it('rejects by name while pdf.worker.js is missing, and reads once it is back', async () => {
	const bytes = await reserve();
	await commands.withhold('pdf.worker.js');
	const missing = await sanitize(bytes).catch((err: unknown) => err);
	await commands.serve('pdf.worker.js');

	expect(missing).toBeInstanceOf(Error);
	expect((missing as Error).message).toContain('pdf.worker.js');
	expect((await sanitize(bytes)).ok).toBe(true);
}, 60_000);

it('ends a worker that does not load and blames no PDF, whatever its URL spells', async () => {
	vi.stubGlobal(
		'URL',
		class extends URL {
			constructor(url: string | URL, base?: string | URL) {
				super(`${url}?from=encrypted-forms`, base);
			}
		}
	);
	const copy = './pdfjs.ts?copy';
	const { openPdf }: typeof import('./pdfjs.js') = await import(/* @vite-ignore */ copy);
	vi.unstubAllGlobals();
	const count = countWorkers();

	const bytes = await reserve();
	await commands.withhold('pdf.worker.js');
	const missing = await openPdf(bytes).catch((err: unknown) => err);
	await commands.serve('pdf.worker.js');

	expect(missing).toBeInstanceOf(Error);
	expect(missing).not.toBeInstanceOf(Refused);
	expect((missing as Error).message).toMatch(/pdf\.worker\.js.*encrypted-forms/);
	expect(count.live.size).toBe(0);
}, 60_000);
