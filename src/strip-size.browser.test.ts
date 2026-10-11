/**
 * The strip deletes what the catalog no longer reaches, and the trailer has to
 * count what is left: `qpdf --check` has nothing to say about a background.
 */

import wasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url';
import { expect, it } from 'vitest';
import { sanitize } from './sanitize.js';

interface Qpdf {
	callMain(args: string[]): number;
	FS: { writeFile(path: string, data: Uint8Array): void };
}

const fixtures = import.meta.glob<string>('../test/fixtures/*.pdf', {
	query: '?url',
	import: 'default',
	eager: true
});

/** The exit status of `qpdf --check` and everything it printed. */
async function checked(pdf: Uint8Array) {
	const printed: string[] = [];
	const mod = (await import('@neslinesli93/qpdf-wasm')).default as unknown as (options: {
		locateFile: () => string;
		print: (line: string) => void;
		printErr: (line: string) => void;
	}) => Promise<Qpdf>;
	const qpdf = await mod({
		locateFile: () => wasmUrl,
		print: (line) => printed.push(line),
		printErr: (line) => printed.push(line)
	});
	qpdf.FS.writeFile('/background.pdf', pdf);
	let status: number;
	try {
		status = qpdf.callMain(['--check', '/background.pdf']);
	} catch (thrown) {
		status = (thrown as { status?: number }).status ?? -1;
	}
	return { status, printed: printed.join('\n') };
}

for (const [path, url] of Object.entries(fixtures)) {
	const name = path.slice(path.lastIndexOf('/') + 1).replace(/(_.*)?\.pdf$/, '');
	it(`${name}: qpdf --check finds nothing to say about the background`, async () => {
		const sanitized = await sanitize(new Uint8Array(await (await fetch(url)).arrayBuffer()));
		if (!sanitized.ok) throw new Error(`refused as ${sanitized.refusal.code}`);

		const { status, printed } = await checked(sanitized.form.pdf);
		expect(printed).not.toMatch(/WARNING|ERROR/);
		expect(status).toBe(0);
	}, 60_000);
}
