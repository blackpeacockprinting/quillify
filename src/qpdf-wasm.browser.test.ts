/**
 * Each file's qpdf worker asks for qpdf.wasm itself, at the URL the page
 * gives it: the worker's script and the binary are requested once for each
 * file, from the page's own origin, and nothing else is.
 */

import { expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import sampleUrl from '../test/fixtures/acroform-sample.pdf?url';
import { normalizePdf } from './normalize.js';
import { sanitize } from './sanitize.js';

it('rejects by name while qpdf.wasm is missing, and reads once it is back', async () => {
	const bytes = new Uint8Array(await (await fetch(sampleUrl)).arrayBuffer());
	await commands.withhold('qpdf.wasm');
	const missing = await sanitize(bytes).catch((err: unknown) => err);
	await commands.serve('qpdf.wasm');

	expect(missing).toBeInstanceOf(Error);
	expect((missing as Error).message).toContain('qpdf.wasm');
	expect((await sanitize(bytes)).ok).toBe(true);
}, 60_000);

it('requests the qpdf worker and qpdf.wasm once for each file, and nothing else', async () => {
	const bytes = new Uint8Array(await (await fetch(sampleUrl)).arrayBuffer());
	await commands.listen();
	await normalizePdf(bytes);
	await normalizePdf(bytes);
	const requested = (await commands.heard()).map((url) => new URL(url));

	expect(requested.map((url) => url.pathname)).toEqual([
		'/assets/qpdf.worker.js',
		'/assets/qpdf.wasm',
		'/assets/qpdf.worker.js',
		'/assets/qpdf.wasm'
	]);
	expect(requested.map((url) => url.origin)).toEqual(Array(4).fill(location.origin));
}, 60_000);
