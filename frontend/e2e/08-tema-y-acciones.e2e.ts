import { expect, Page, test } from '@playwright/test';

import { visit } from './support/a11y';
import { loginUi } from './support/ui';

/**
 * Tema claro y oscuro (spec 005, US1): preferencia del sistema, elección persistente,
 * sincronía entre pestañas, arranque sin destello y almacenamiento bloqueado.
 */
const KEY = 'gpc-theme';

const theme = (page: Page) => page.locator('html');
const toggle = (page: Page) => page.getByRole('button', { name: 'Tema oscuro' });

for (const scheme of ['dark', 'light'] as const) {
  test(`sin preferencia guardada sigue al sistema (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await visit(page, '/login');
    await expect(theme(page)).toHaveAttribute('data-theme', scheme);
    await loginUi(page, 'author');
    await expect(theme(page)).toHaveAttribute('data-theme', scheme);
    await expect(toggle(page)).toHaveAttribute('aria-pressed', String(scheme === 'dark'));
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull();
  });
}

test('la elección de la cabecera persiste al recargar y en una pestaña nueva', async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await loginUi(page, 'author');
  await expect(theme(page)).toHaveAttribute('data-theme', 'light');

  await toggle(page).click();
  await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');

  // El sistema indica lo contrario: manda la elección guardada.
  await page.reload();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(theme(page)).toHaveAttribute('data-theme', 'dark');

  const other = await context.newPage();
  await other.emulateMedia({ colorScheme: 'light' });
  await visit(other, '/catalog');
  await expect(theme(other)).toHaveAttribute('data-theme', 'dark');
});

test('al alternar en una pestaña, las demás lo adoptan sin recargar', async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await loginUi(page, 'author');
  const other = await context.newPage();
  await other.emulateMedia({ colorScheme: 'light' });
  await visit(other, '/catalog');
  await other.evaluate(() => ((window as unknown as { sinRecarga: boolean }).sinRecarga = true));

  await toggle(page).click();
  await expect(theme(other)).toHaveAttribute('data-theme', 'dark');
  await toggle(page).click();
  await expect(theme(other)).toHaveAttribute('data-theme', 'light');

  expect(await other.evaluate(() => (window as unknown as { sinRecarga?: boolean }).sinRecarga)).toBe(
    true,
  );
});

test('sin destello: el tema está aplicado antes de que se ejecute la SPA', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript((key) => localStorage.setItem(key, 'dark'), KEY);
  // El paquete principal queda retenido hasta terminar las comprobaciones.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let requested = false;
  await page.route(/\/main-[^/]+\.js$/, async (route) => {
    requested = true;
    await held;
    await route.continue();
  });

  await page.goto('/login', { waitUntil: 'commit' });
  await page.locator('app-root').waitFor({ state: 'attached' });
  await expect.poll(() => requested).toBe(true);

  await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
  expect(await page.locator('app-root > *').count()).toBe(0);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(15, 23, 42)');

  release();
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
});

test('con el almacenamiento bloqueado el tema cambia y no hay errores', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const blocked = () => {
      throw new DOMException('Bloqueado', 'SecurityError');
    };
    Storage.prototype.getItem = blocked;
    Storage.prototype.setItem = blocked;
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await loginUi(page, 'author');

  await toggle(page).click();
  await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
  await toggle(page).click();
  await expect(theme(page)).toHaveAttribute('data-theme', 'light');
  expect(errors).toEqual([]);
});
