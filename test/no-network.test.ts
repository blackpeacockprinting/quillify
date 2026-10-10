import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';

const NETWORK = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\b/;

it('names none of these six request APIs, in any source file', () => {
	const found = readdirSync('src')
		.filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
		.flatMap((name) =>
			readFileSync(`src/${name}`, 'utf8')
				.split('\n')
				.flatMap((line, index) => (NETWORK.test(line) ? [`src/${name}:${index + 1}`] : []))
		);
	expect(found).toEqual([]);
});
