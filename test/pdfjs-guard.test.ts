import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('runs against a pdf.js worker guarded at both sites', () => {
	const worker = readFileSync('node_modules/pdfjs-dist/build/pdf.worker.mjs', 'utf8');
	expect(
		worker.split('children == null ? []').length - 1,
		'The installed pdf.js worker is not guarded. Run `npm run patch`.'
	).toBe(2);
});
