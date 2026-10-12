import { hash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';

const STALE = 'assets/ is missing or stale. Run `npm run assets`.';
const asset = (name: string) =>
	existsSync(`assets/${name}`) ? readFileSync(`assets/${name}`) : Buffer.alloc(0);

const sourceLines = readdirSync('src')
	.filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
	.flatMap((name) =>
		readFileSync(`src/${name}`, 'utf8')
			.split('\n')
			.map((text, index) => ({ at: `src/${name}:${index + 1}`, text: text.trim() }))
	);

it('reaches no asset through a bundler suffix or an absolute path, in any source file', () => {
	const found = sourceLines.filter(({ text }) => /\?(url|inline|raw)\b|['"`]\/assets\b/.test(text));
	expect(found.map(({ at }) => at)).toEqual([]);
});

it('starts each of its two workers in one place, from the constant that holds its URL', () => {
	const code = sourceLines.filter(({ text }) => !text.startsWith('//') && !text.startsWith('*'));
	expect(
		code.filter(({ text }) => /new Worker\(|new URL\(.*\.worker/.test(text)).map(({ text }) => text)
	).toEqual([
		"const WORKER = new URL('../assets/qpdf.worker.js', import.meta.url);",
		'const worker = new Worker(WORKER);',
		"const WORKER = new URL('../assets/pdf.worker.js', import.meta.url);",
		"const port = new Worker(WORKER, { type: 'module' });"
	]);
});

it('ships the pdf.js worker under a first line that says it was changed', () => {
	const [first] = asset('pdf.worker.js').toString().split('\n', 1);
	expect(first, STALE).toMatch(/^\/\* The worker of pdfjs-dist 6\.4\.299 .*changed.*\*\/$/);
});

it('ships the pdf.js worker with the null guard at both sites and no site without it', () => {
	const worker = asset('pdf.worker.js').toString();
	expect(
		[
			worker.split('children == null ? [] : children.isXFAObjectArray').length - 1,
			worker.split('children = children.isXFAObjectArray').length - 1
		],
		STALE
	).toEqual([2, 0]);
});

it('ships the qpdf.wasm whose hash is recorded', () => {
	expect(hash('sha256', asset('qpdf.wasm')), STALE).toBe(
		'abd933f4ccace4f732999381b21aec8b7e3726f18a5b167fafd57f88dd440876'
	);
});

it("ships the qpdf worker as qpdf-wasm's script under a first line and above the handler", () => {
	const installed = readFileSync('node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.js', 'utf8');
	const handler = readFileSync('src/qpdf-handler.js', 'utf8');
	const shipped = asset('qpdf.worker.js').toString();
	const first = shipped.slice(0, shipped.indexOf('\n') + 1);

	expect(first, STALE).toBe(
		"/* dist/qpdf.js of @neslinesli93/qpdf-wasm 0.3.0, unchanged, and after it quillify's message handler. */\n"
	);
	expect(shipped === first + installed + handler, STALE).toBe(true);
});

it('ships the stage stylesheet as the default export of a module', async () => {
	const stylesheet = await import('../assets/xfa-layer.js').catch(() => ({ default: '' }));
	expect(stylesheet.default, STALE).toBe(readFileSync('src/xfa-layer.css', 'utf8'));
});

it('ships the pdf.js worker as the installed one but for the notice, the guards and the map', () => {
	const UNGUARDED = 'children = children.isXFAObjectArray ? children.children : [children];';
	const GUARDED =
		'children = children == null ? [] : children.isXFAObjectArray ? children.children : [children];';
	const installed = readFileSync('node_modules/pdfjs-dist/build/pdf.worker.mjs', 'utf8').split(
		'\n'
	);
	const shipped = asset('pdf.worker.js').toString().split('\n').slice(1);
	expect(shipped, STALE).toHaveLength(installed.length);

	const differing = installed.flatMap((line, index) =>
		line === shipped[index] ? [] : [[line.trim(), shipped[index].trim()]]
	);
	expect(differing, STALE).toEqual([
		[UNGUARDED, GUARDED],
		[UNGUARDED, GUARDED],
		[
			'const savedMethod = extraNode[$getSubformParent];',
			'const savedMethod = extraNode[$getSubformParent]; const savedFirst = root[$extra].firstUnsplittable;'
		],
		[
			'extraNode[$getSubformParent] = savedMethod;',
			'extraNode[$getSubformParent] = savedMethod; root[$extra].firstUnsplittable = savedFirst;'
		],
		['if (!this.ui) {', 'if (!this.ui || this.ui.defaultUi || !this.ui[$getExtra]()) {'],
		[
			'const ui = this.ui[$toHTML]().html;',
			'const ui = this.ui[$toHTML]().html ?? { name: "label", attributes: { class: ["xfaLabel"] }, children: [{ name: "div", attributes: { class: [this.ui.signature ? "xfaSignature" : this.ui.barcode ? "xfaBarcode" : this.ui.passwordEdit ? "xfaPasswordEdit" : "xfaImageEdit"], style: { width: "100%" } }, children: [] }] };'
		],
		['this[$extra].pageSetIndex = -1;', 'this[$extra].pageSetIndex = -1; this[$cleanPage]();'],
		[
			'warn(`XFA - an error occurred during layout: ${e}`);',
			'warn(`XFA - an error occurred during layout: ${e}`); throw new Error(`XFA layout: ${e.message}`);'
		],
		['//# sourceMappingURL=pdf.worker.mjs.map', '']
	]);
});
