/**
 * The message handler at the end of `assets/qpdf.worker.js`, run here after a
 * stand-in for qpdf-wasm's script, so that what qpdf does is the test's to
 * say. No file stands in for a qpdf that throws: what qpdf does with the one
 * kind of file known to break it depends on where it runs.
 */

import { expect, it } from 'vitest';
import handler from './qpdf-handler.js?raw';

interface Answer {
	loaded: boolean;
	out?: Uint8Array;
}

/** What the handler answers one file with, when the script before it defines `Module` as given. */
function answer(module: string): Promise<Answer> {
	const url = URL.createObjectURL(new Blob([`const Module = ${module};\n`, handler]));
	const worker = new Worker(url);
	return new Promise<Answer>((resolve, reject) => {
		worker.onmessage = ({ data }) => resolve(data);
		worker.onerror = () => reject(new Error('the handler threw'));
		worker.postMessage({ bytes: Uint8Array.of(1, 2), flags: ['--flag'], wasm: 'where/qpdf.wasm' });
	}).finally(() => {
		worker.terminate();
		URL.revokeObjectURL(url);
	});
}

/** A module that starts, keeps the files written to it, and runs `main` as qpdf's. */
const starts = (main: string) => `async ({ locateFile }) => {
	const files = {};
	const FS = {
		writeFile: (path, bytes) => void (files[path] = bytes),
		readFile(path) {
			if (!(path in files)) throw new Error('no such file');
			return files[path];
		}
	};
	return { FS, callMain: (args) => (${main})(args, files, locateFile) };
}`;

it('runs qpdf once on the file, with the flags between its two paths, and answers with what it wrote', async () => {
	const { loaded, out } = await answer(
		starts(`(args, files, locateFile) => {
			const seen = { args, file: [...files['/in.pdf']], wasm: locateFile() };
			files['/out.pdf'] = new TextEncoder().encode(JSON.stringify(seen));
			return 0;
		}`)
	);

	expect(loaded).toBe(true);
	expect(JSON.parse(new TextDecoder().decode(out))).toEqual({
		args: ['/in.pdf', '--flag', '/out.pdf'],
		file: [1, 2],
		wasm: 'where/qpdf.wasm'
	});
});

it('answers with no file when qpdf throws', async () => {
	const trap = `() => {
		throw new WebAssembly.RuntimeError('memory access out of bounds');
	}`;

	expect(await answer(starts(trap))).toEqual({ loaded: true });
});

it('answers with no file when qpdf wrote none', async () => {
	expect(await answer(starts('() => 2'))).toEqual({ loaded: true });
});

it('says that the module did not start', async () => {
	const module = `() => Promise.reject(new Error('no binary'))`;

	expect(await answer(module)).toEqual({ loaded: false });
});
