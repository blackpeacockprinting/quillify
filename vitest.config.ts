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
