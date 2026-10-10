import { init } from '@quillmark/wasm';
import type { Quill } from '@quillmark/wasm';
import { expect, it } from 'vitest';
import readme from '../README.md?raw';
import { quillify, sanitize, suggest } from '../src/index.js';
import form from './fixtures/DD1610_Request_and_Authorization_for_TDY_Travel.pdf?url';

/** The block's own imports, which the test stands in for with the modules of this checkout. */
const IMPORTS = `import { init } from '@quillmark/wasm';
import { quillify, sanitize, suggest } from 'quillify';
`;

it('runs the block the README prints under Use, as it is printed', async () => {
	const block = /^## Use\n+```ts\n(.*?)^```/ms.exec(readme)?.[1] ?? '';
	expect(block.slice(0, IMPORTS.length)).toBe(IMPORTS);
	const AsyncFunction = (async () => {}).constructor as new (
		parameters: string,
		body: string
	) => (...bound: unknown[]) => Promise<Quill>;
	const use = new AsyncFunction(
		'pdf, init, quillify, sanitize, suggest',
		`${block.slice(IMPORTS.length)}\nreturn quill;`
	);

	const pdf = new Uint8Array(await (await fetch(form)).arrayBuffer());
	const quill = await use(pdf, init, quillify, sanitize, suggest);
	expect(quill.metadata.name).toBe('tdy_request');
	quill.free();

	// The block's two other ways out: a file that is refused, and a naming with a problem.
	await expect(use(new Uint8Array(4), init, quillify, sanitize, suggest)).rejects.toThrow(
		'not_pdf'
	);
	await expect(use(pdf, init, quillify, sanitize, () => [])).rejects.toThrow('unnamed_field');
});
