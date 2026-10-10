// prose/research/pdfjs-som-null-guard.diff has the diagnosis behind the guard.

import { hash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const UNGUARDED = 'children = children.isXFAObjectArray ? children.children : [children];';
const GUARDED =
	'children = children == null ? [] : children.isXFAObjectArray ? children.children : [children];';
const SOURCE_MAP = '//# sourceMappingURL=pdf.worker.mjs.map';
const QPDF_WASM = 'abd933f4ccace4f732999381b21aec8b7e3726f18a5b167fafd57f88dd440876';

const { version } = JSON.parse(readFileSync('node_modules/pdfjs-dist/package.json', 'utf8'));
const worker = readFileSync('node_modules/pdfjs-dist/build/pdf.worker.mjs', 'utf8');
const sites = worker.split(UNGUARDED).length - 1;
if (sites !== 2)
	throw new Error(
		`pdf.worker.mjs has ${sites} unguarded sites, and the guard is written for 2. ` +
			'If node_modules was patched in place by an older checkout, reinstall it with `npm ci`.'
	);
if (!worker.endsWith(SOURCE_MAP)) throw new Error(`pdf.worker.mjs does not end in ${SOURCE_MAP}`);

const wasm = readFileSync('node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
const sha256 = hash('sha256', wasm);
if (sha256 !== QPDF_WASM) throw new Error(`qpdf.wasm hashes to ${sha256}, expected ${QPDF_WASM}`);

const stylesheet = readFileSync('src/xfa-layer.css', 'utf8');

rmSync('assets', { recursive: true, force: true });
mkdirSync('assets');
for (const [name, content] of [
	[
		'pdf.worker.js',
		`/* The worker of pdfjs-dist ${version} (build/pdf.worker.mjs), changed: a null guard added at two sites, and the last line, which named a source map, removed. */\n` +
			worker.slice(0, -SOURCE_MAP.length).replaceAll(UNGUARDED, GUARDED)
	],
	['qpdf.wasm', wasm],
	['xfa-layer.js', `export default ${JSON.stringify(stylesheet)};\n`],
	['xfa-layer.d.ts', 'declare const stylesheet: string;\nexport default stylesheet;\n']
]) {
	writeFileSync(`assets/${name}`, content);
	console.log(`assets/${name}: ${Buffer.byteLength(content)} bytes`);
}
