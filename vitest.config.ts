import { createReadStream } from 'node:fs';
import { playwright } from '@vitest/browser-playwright';
import { configDefaults, defineConfig } from 'vitest/config';

const BROWSER = '**/*.browser.test.ts';

export default defineConfig({
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				test: {
					name: 'node',
					exclude: [...configDefaults.exclude, '**/dist/**', BROWSER]
				}
			},
			{
				plugins: [
					// src/pdfjs.ts points pdf.js at /pdfjs/wasm/ for its image codecs.
					{
						name: 'pdfjs-codecs',
						configureServer({ middlewares }) {
							middlewares.use('/pdfjs/wasm', (req, res, next) => {
								if (req.url!.includes('..')) return res.writeHead(403).end();
								createReadStream(`node_modules/pdfjs-dist/wasm${req.url}`)
									.on('error', next)
									.pipe(res);
							});
						}
					}
				],
				test: {
					name: 'chromium',
					include: [BROWSER],
					browser: {
						enabled: true,
						headless: true,
						screenshotFailures: false,
						provider: playwright(),
						instances: [{ browser: 'chromium' }]
					}
				}
			}
		]
	}
});
