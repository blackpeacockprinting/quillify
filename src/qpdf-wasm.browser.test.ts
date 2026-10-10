/**
 * qpdf is loaded once and kept for the life of the page, so this case has a
 * file to itself: in a page that has already normalized a PDF, nothing
 * requests qpdf.wasm again.
 */

import { expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import sampleUrl from '../test/fixtures/acroform-sample.pdf?url';
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
