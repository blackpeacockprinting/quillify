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
	size?: number;
}

/** What the handler answers one file with, under a limit of ten bytes, when the script before it defines `Module` as given. */
function answer(module: string): Promise<Answer> {
	const url = URL.createObjectURL(new Blob([`const Module = ${module};\n`, handler]));
	const worker = new Worker(url);
	return new Promise<Answer>((resolve, reject) => {
		worker.onmessage = ({ data }) => resolve(data);
		worker.onerror = () => reject(new Error('the handler threw'));
		worker.postMessage({
			bytes: Uint8Array.of(1, 2),
			flags: ['--flag'],
			wasm: 'where/qpdf.wasm',
			limit: 10
		});
	}).finally(() => {
		worker.terminate();
		URL.revokeObjectURL(url);
	});
}

/**
 * A module that starts with a heap of five bytes, keeps the files written to
 * it, and runs `main` as qpdf's. `FS.write` is how qpdf's own code writes: a
 * piece of a file at a time.
 */
const starts = (main: string) => `async ({ locateFile }) => {
	const files = {};
	const FS = {
		writeFile: (path, bytes) => void (files[path] = bytes),
		write(stream, buffer, offset, length) {
			const piece = buffer.subarray(offset, offset + length);
			files[stream.path] = Uint8Array.of(...(files[stream.path] ?? []), ...piece);
			return length;
		},
		readFile(path) {
			if (!(path in files)) throw new Error('no such file');
			return files[path];
		}
	};
	return { FS, HEAPU8: new Uint8Array(5), callMain: (args) => (${main})(args, files, locateFile, FS) };
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

	expect(await answer(starts(trap))).toEqual({ loaded: true, size: 5 });
});

it('answers with no file when qpdf wrote none', async () => {
	expect(await answer(starts('() => 2'))).toEqual({ loaded: true, size: 5 });
});

it('answers with no file when qpdf ends with an error, though it left part of one', async () => {
	const gaveUp = `(args, files) => {
		files['/out.pdf'] = new Uint8Array(3);
		return 2;
	}`;

	expect(await answer(starts(gaveUp))).toEqual({ loaded: true, size: 5 });
});

it('answers with the file when qpdf ends with warnings', async () => {
	const warned = `(args, files) => {
		files['/out.pdf'] = Uint8Array.of(7);
		return 3;
	}`;

	expect(await answer(starts(warned))).toEqual({ loaded: true, out: Uint8Array.of(7), size: 5 });
});

it('answers with what qpdf wrote as the size, when that is more than its heap', async () => {
	const wrote = `(args, files, locateFile, FS) => {
		FS.write({ path: '/out.pdf' }, Uint8Array.of(0, 1, 2, 3, 4, 5, 6, 7, 8, 9), 1, 8);
		return 0;
	}`;

	expect(await answer(starts(wrote))).toEqual({
		loaded: true,
		out: Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8),
		size: 8
	});
});

it('ends qpdf at the write that passes the limit, and answers with no file', async () => {
	const fivePieces = `(args, files, locateFile, FS) => {
		for (let piece = 0; piece < 5; piece++) FS.write({ path: '/out.pdf' }, new Uint8Array(4), 0, 4);
		return 0;
	}`;

	expect(await answer(starts(fivePieces))).toEqual({ loaded: true, size: 12 });
});

it('says that the module did not start', async () => {
	const module = `() => Promise.reject(new Error('no binary'))`;

	expect(await answer(module)).toEqual({ loaded: false });
});
