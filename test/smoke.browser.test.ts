import { expect, it } from 'vitest';

it('runs in headless Chromium', () => {
	expect(navigator.userAgent).toContain('HeadlessChrome');
});
