import { hash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const dir = process.env.QUILLIFY_CORPUS;
if (!dir) throw new Error('QUILLIFY_CORPUS has to name the directory that holds the forms.');

/** The URL the test server answers with each PDF of the directory, by the file's SHA-256. */
const found = Object.fromEntries(
	readdirSync(dir)
		.filter((name) => name.toLowerCase().endsWith('.pdf'))
		.map((name) => resolve(dir, name))
		.filter((path) => statSync(path).isFile())
		.map((path) => [hash('sha256', readFileSync(path)), `/@fs${path}`])
);

export default defineConfig({
	server: { fs: { allow: ['.', dir] } },
	test: {
		include: ['corpus/run.ts'],
		reporters: ['verbose'],
		provide: { found },
		bail: 1,
		testTimeout: 120_000,
		expect: { requireAssertions: true },
		browser: {
			enabled: true,
			headless: true,
			screenshotFailures: false,
			provider: playwright(),
			instances: [{ browser: 'chromium' }]
		}
	}
});

declare module 'vitest' {
	interface ProvidedContext {
		found: Record<string, string>;
	}
}
