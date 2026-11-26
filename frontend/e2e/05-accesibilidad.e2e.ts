import { expect, Page, test } from '@playwright/test';

import {
  describeFindings,
  expectTheme,
  scan,
  Theme,
  THEMES,
  visit,
  withTheme,
} from './support/a11y';
import { RUN } from './support/env';
import { loginUi } from './support/ui';
import { accountFor, buildWorld, World } from './support/world';

/**
 * Accesibilidad (TSK-92): axe-core con WCAG 2.x A/AA —contraste incluido— sobre las
 * pantallas de cada rol, con datos reales y con los diálogos abiertos, en tema claro y en
 * tema oscuro (spec 005).
 */
let world: World;
test.beforeAll(async () => {
  world = await buildWorld('Accesibilidad');
});

/** Acumula los hallazgos de una prueba y los reporta todos juntos al final. */
function collector(theme: Theme) {
  const found: string[] = [];
  return {
    async check(page: Page, name: string): Promise<void> {
      await expectTheme(page, theme);
      const result = await scan(page);
      if (result.length > 0) {
        found.push(`[tema ${theme}] ${name}\n${describeFindings(result)}`);
      }
    },
    done(): void {
      expect(found, `Violaciones WCAG A/AA:\n${found.join('\n')}`).toEqual([]);
    },
  };
}

test('control: axe detecta un contraste insuficiente (la prueba no pasa en vacío)', async ({
  page,
}) => {
  await page.setContent(
    '<!doctype html><html lang="es"><head><title>x</title></head><body><main><h1>Prueba</h1>' +
      '<p style="color:#bbbbbb;background:#ffffff">Texto de bajo contraste</p></main></body></html>',
  );
  const rules = (await scan(page)).map((f) => f.rule);
  expect(rules).toContain('color-contrast');
});

for (const theme of THEMES) {
  test.describe(`tema ${theme}`, () => {
    test.beforeEach(async ({ page }) => withTheme(page, theme));

    test('público', async ({ page }) => {
      const c = collector(theme);
      await visit(page, '/login');
      await c.check(page, 'login');
      await visit(page, '/catalog');
      await c.check(page, 'catálogo');
      await visit(page, `/catalog/${world.accepted.code}`);
      await c.check(page, 'ficha del catálogo');
      c.done();
    });

    test('Autor', async ({ page }) => {
      const c = collector(theme);
      await loginUi(page, 'author');
      await c.check(page, 'panel del autor');
      for (const [name, path] of [
        ['mis manuscritos', '/app/author/manuscripts'],
        ['nuevo manuscrito', '/app/author/manuscripts/new'],
        ['detalle enviado', `/app/author/manuscripts/${world.review.id}`],
        ['detalle borrador', `/app/author/manuscripts/${world.draftId}`],
        ['editar borrador', `/app/author/manuscripts/${world.draftId}/edit`],
        ['historial', `/app/author/manuscripts/${world.review.id}/history`],
        ['avisos', '/app/notifications'],
      ]) {
        await visit(page, path);
        await c.check(page, `autor: ${name}`);
      }
      await visit(page, `/app/author/manuscripts/${world.review.id}`);
      await page.getByRole('button', { name: 'Dar de baja' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await c.check(page, 'autor: diálogo de baja');
      c.done();
    });

    test('Revisor', async ({ page }) => {
      const c = collector(theme);
      await loginUi(page, accountFor('reviewer', world));
      await c.check(page, 'panel del revisor');
      await visit(page, '/app/reviewer/assignments');
      await expect(page.getByRole('heading', { name: /Mi desempeño/i }).first()).toBeVisible();
      await c.check(page, 'revisor: asignaciones y desempeño');
      await page.getByRole('link', { name: world.review.code, exact: true }).click();
      await expect(page.locator('h1').first()).toBeVisible();
      await c.check(page, 'revisor: detalle');
      await page.getByRole('link', { name: 'Evaluar manuscrito' }).click();
      await expect(page.locator('h1').first()).toBeVisible();
      await c.check(page, 'revisor: formulario de evaluación (rúbrica)');
      // Con puntajes bajos aparece el contador de la justificación (estado nuevo a medir).
      await page.getByRole('group', { name: /^Pertinencia/ }).locator('label').filter({ hasText: /^\s*2 · / }).click();
      await expect(page.locator('.counter')).toBeVisible();
      await c.check(page, 'revisor: rúbrica con contador de justificación');
      await page.getByRole('button', { name: 'Reportar posible fuga de identidad' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await c.check(page, 'revisor: diálogo de fuga');
      await visit(page, '/app/reviewer/history');
      await c.check(page, 'revisor: historial');
      c.done();
    });

    test('Administrador', async ({ page }) => {
      const c = collector(theme);
      await loginUi(page, 'admin');
      await c.check(page, 'panel del administrador');
      for (const [name, path] of [
        ['incidentes', '/app/admin/incidents'],
        ['revisores', '/app/admin/reviewers'],
        ['carreras', '/app/admin/areas'],
        ['auditoría', '/app/admin/audit'],
      ]) {
        await visit(page, path);
        await c.check(page, `admin: ${name}`);
      }
      await visit(page, '/app/admin/audit');
      await page
        .getByRole('link', { name: /Ver detalle/ })
        .first()
        .click();
      await expect(page.locator('h1').first()).toBeVisible();
      await c.check(page, 'admin: detalle del evento');
      c.done();
    });
  });
}
