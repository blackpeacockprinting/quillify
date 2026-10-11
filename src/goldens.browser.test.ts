import { expect, it } from 'vitest';
import { inventoryPdf } from './inventory.js';
import { normalizePdf } from './normalize.js';
import { xfaToAcroForm } from './xfa.js';
import type { FieldInventory } from './types.js';

const fixtures = import.meta.glob<string>('../test/fixtures/*.pdf', {
	query: '?url',
	import: 'default',
	eager: true
});
const goldens = import.meta.glob<FieldInventory>('../test/goldens/*.inventory.json', {
	import: 'default',
	eager: true
});
const named = (path: string) => path.slice(path.lastIndexOf('/') + 1);

for (const [path, golden] of Object.entries(goldens)) {
	const form = named(path).replace('.inventory.json', '');
	const [, fixture] = Object.entries(fixtures).find(([file]) =>
		named(file).startsWith(`${form}_`)
	)!;
	it(`${form} inventories as its golden records`, async () => {
		const bytes = new Uint8Array(await (await fetch(fixture)).arrayBuffer());
		const inventory = await inventoryPdf(await xfaToAcroForm(await normalizePdf(bytes)));
		expect(inventory).toEqual(golden);
	}, 120_000);
}
