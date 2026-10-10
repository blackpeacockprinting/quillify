import { hash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';

const DIR = 'test/fixtures';

it('holds every fixture to the hash its manifest entry records', () => {
	const manifest: Record<string, { sha256: string }> = JSON.parse(
		readFileSync(`${DIR}/MANIFEST.json`, 'utf8')
	);
	const recorded = Object.fromEntries(
		Object.entries(manifest).map(([name, entry]) => [name, entry.sha256])
	);
	const found = Object.fromEntries(
		readdirSync(DIR, { recursive: true, encoding: 'utf8' })
			.filter((name) => name.toLowerCase().endsWith('.pdf'))
			.map((name) => [name, hash('sha256', readFileSync(`${DIR}/${name}`))])
	);
	expect(found).toEqual(recorded);
});
