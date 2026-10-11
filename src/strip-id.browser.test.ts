/**
 * The same bytes in give the same bytes out, so a quill can be named by its
 * hash. qpdf writes the second element of a file's /ID from the clock, so the
 * builds are more than two seconds apart.
 */

import { beforeAll, expect, it } from 'vitest';
import { sanitize } from './sanitize.js';

const fixtures = import.meta.glob<string>('../test/fixtures/*.pdf', {
	query: '?url',
	import: 'default',
	eager: true
});
const names = Object.keys(fixtures).map((path) =>
	path.slice(path.lastIndexOf('/') + 1).replace(/(_.*)?\.pdf$/, '')
);

async function built(url: string) {
	const sanitized = await sanitize(new Uint8Array(await (await fetch(url)).arrayBuffer()));
	if (!sanitized.ok) throw new Error(`refused as ${sanitized.refusal.code}`);
	const digest = await crypto.subtle.digest('SHA-256', sanitized.form.pdf.slice());
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const first = new Map<string, string>();
beforeAll(async () => {
	for (const [index, url] of Object.values(fixtures).entries())
		first.set(names[index], await built(url));
	await new Promise((resolve) => setTimeout(resolve, 2100));
}, 120_000);

for (const [index, url] of Object.values(fixtures).entries())
	it(`${names[index]}: built twice, two seconds apart, the background has one SHA-256`, async () => {
		expect(await built(url)).toBe(first.get(names[index]));
	}, 60_000);
