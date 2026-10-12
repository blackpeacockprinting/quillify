import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';

const NETWORK = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\b/;

it('names these six request APIs nowhere in the source but where a face of the package is fetched', () => {
	const found = readdirSync('src')
		.filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
		.flatMap((name) =>
			readFileSync(`src/${name}`, 'utf8')
				.split('\n')
				.flatMap((line) => (NETWORK.test(line) ? [`src/${name}: ${line.trim()}`] : []))
		);
	expect(found).toEqual([
		'src/pdfjs.ts: async fetch({ filename }: { filename: string }): Promise<Uint8Array> {',
		'src/pdfjs.ts: const response = await fetch(FACES[filename]);'
	]);
});
