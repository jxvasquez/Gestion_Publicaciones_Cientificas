import { expect, Page, test } from '@playwright/test';

import { expectTheme, THEMES, visit, withTheme } from './support/a11y';
import { measureView, read, Sample } from './support/contrast';
import { loginUi } from './support/ui';
import { accountFor, buildWorld, Role, screens, World } from './support/world';

/**
 * Tema claro y oscuro (spec 005). US1: preferencia del sistema, elección persistente,
 * sincronía entre pestañas, arranque sin destello y almacenamiento bloqueado. US2:
 * contraste medido en reposo, hover, foco y error en ambos temas. US6: como máximo una
 * acción destacada por vista, por fila de tabla y por elemento de lista. Colores
 * forzados: barras, avatar, marcadores de etapa y paneles conservan su borde.
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

test('control: la medición detecta contrastes insuficientes (no pasa en vacío)', async ({
  page,
}) => {
  await page.setContent(
    '<!doctype html><body style="background:#fff"><button style="color:#bbb;background:#fff;' +
      'border:1px solid #eee;outline:3px solid #ddd">Bajo contraste</button></body>',
  );
  const reading = await read(page.getByRole('button'));
  expect(reading.text).toBeLessThan(4.5);
  expect(reading.border).toBeLessThan(3);
  expect(reading.ring).toBeLessThan(3);
});

test.describe('contraste de estados', () => {
  let world: World;
  test.beforeAll(async () => {
    world = await buildWorld('Contraste');
  });

  const views: { name: string; role: Role; path: (w: World) => string }[] = [
    { name: 'panel', role: 'author', path: () => '/app/dashboard' },
    {
      name: 'detalle del manuscrito',
      role: 'author',
      path: (w) => `/app/author/manuscripts/${w.review.id}`,
    },
    {
      name: 'detalle de la asignación',
      role: 'reviewer',
      path: (w) => `/app/reviewer/assignments/${w.assignmentId}`,
    },
    { name: 'auditoría', role: 'admin', path: () => '/app/admin/audit' },
  ];

  const lowest = (samples: Sample[], metric: Sample['metric']) =>
    Math.min(...samples.filter((s) => s.metric === metric).map((s) => s.ratio)).toFixed(2);

  for (const theme of THEMES) {
    for (const view of views) {
      test(`${view.name} en tema ${theme}`, async ({ page }) => {
        await withTheme(page, theme);
        await loginUi(page, accountFor(view.role, world));
        await visit(page, view.path(world));
        await expectTheme(page, theme);

        const samples = await measureView(page);

        for (const state of ['reposo', 'hover', 'foco', 'error']) {
          expect(samples.some((s) => s.state === state), `sin muestras en ${state}`).toBe(true);
        }
        console.log(
          `CONTRASTE | ${theme} | ${view.name} | ${samples.length} muestras | texto ${lowest(samples, 'texto')} | borde ${lowest(samples, 'borde')} | anillo ${lowest(samples, 'anillo')}`,
        );
        const low = samples
          .filter((s) => s.ratio < s.min)
          .map((s) => `${s.target} · ${s.state} · ${s.metric}: ${s.ratio.toFixed(2)} < ${s.min}`);
        expect(low, `[tema ${theme}] ${view.name}:\n${low.join('\n')}`).toEqual([]);
      });
    }
  }
});

/**
 * Textos de las acciones con relleno visibles, agrupadas por la fila o el elemento de
 * lista más cercano (el resto de la vista es un grupo). Los diálogos y un «Más acciones»
 * que la persona abrió son contextos propios (FR-015).
 */
async function highlightedActions(page: Page): Promise<string[][]> {
  return page.evaluate(() => {
    const groups = new Map<Element | null, string[]>();
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>('.btn--primary, .btn--success, .btn--danger'),
    )) {
      if (
        !el.checkVisibility({ visibilityProperty: true }) ||
        el.closest('dialog, details.disclosure--more[open]')
      ) {
        continue;
      }
      const group = el.closest('tr, li');
      groups.set(group, [...(groups.get(group) ?? []), (el.textContent ?? '').trim()]);
    }
    return Array.from(groups.values());
  });
}

test('control: el conteo detecta dos acciones destacadas juntas (no pasa en vacío)', async ({
  page,
}) => {
  await page.setContent(
    '<!doctype html><body><button class="btn--primary">Una</button><button class="btn--danger">Dos</button>' +
      '<ul><li><button class="btn--success">Fila</button></li></ul>' +
      '<dialog><button class="btn--primary">Diálogo</button></dialog>' +
      '<details class="disclosure--more" open><summary>Más</summary><button class="btn--danger">Baja</button></details></body>',
  );
  expect(await highlightedActions(page)).toEqual([['Una', 'Dos'], ['Fila']]);
});

test.describe('acciones destacadas', () => {
  let world: World;
  test.beforeAll(async () => {
    world = await buildWorld('Acciones');
  });

  for (const role of [null, 'author', 'reviewer', 'admin'] as const) {
    test(`como máximo una por vista y por fila (${role ?? 'público'})`, async ({ page }) => {
      if (role) {
        await loginUi(page, accountFor(role, world));
      }
      const found: string[] = [];
      const excess: string[] = [];
      for (const screen of screens(world).filter((s) => s.role === role)) {
        await visit(page, screen.path);
        for (const group of await highlightedActions(page)) {
          found.push(...group);
          if (group.length > 1) {
            excess.push(`${screen.name}: ${group.join(' + ')}`);
          }
        }
      }
      console.log(`ACCIONES | ${role ?? 'público'} | ${found.join(' · ')}`);
      expect(excess, excess.join('\n')).toEqual([]);
      // El revisor y los demás tienen al menos una: el selector sigue encontrando botones.
      expect(found.length).toBeGreaterThan(0);
    });
  }
});

test.describe('colores forzados', () => {
  let world: World;
  test.beforeAll(async () => {
    world = await buildWorld('Colores forzados');
  });

  /** Ancho del borde superior de cada coincidencia, en píxeles. */
  const borders = (page: Page, selector: string) =>
    page.locator(selector).evaluateAll((elements) =>
      elements.map((el) => {
        const style = getComputedStyle(el);
        return style.borderTopStyle === 'none' ? 0 : parseFloat(style.borderTopWidth);
      }),
    );

  const expectBorders = async (page: Page, selector: string) => {
    const widths = await borders(page, selector);
    expect(widths.length, `sin elementos ${selector}`).toBeGreaterThan(0);
    for (const width of widths) {
      expect(width, selector).toBeGreaterThanOrEqual(1);
    }
  };

  const background = (page: Page, selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);

  test('avatar, marcadores de etapa y paneles se distinguen', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await loginUi(page, 'author');
    await visit(page, `/app/author/manuscripts/${world.review.id}`);

    await expectBorders(page, '.avatar');
    await expectBorders(page, '.progress__marker');
    await expectBorders(page, '.disclosure > summary');
    // La línea entre etapas es un fondo: sin un color del sistema desaparecería.
    const line = await page
      .locator('.progress__stage')
      .first()
      .evaluate((el) => getComputedStyle(el, '::after').backgroundColor);
    expect(line).not.toBe(await background(page, '.progress'));
  });

  test('las barras conservan su borde y su relleno visible', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await loginUi(page, accountFor('reviewer', world));
    for (const path of [
      '/app/reviewer/assignments',
      `/app/reviewer/assignments/${world.assignmentId}`,
    ]) {
      await visit(page, path);
      await expect(page.locator('.meter-bar').first()).toBeVisible();
      await expectBorders(page, '.meter-bar');
      expect(await background(page, '.meter-bar__fill')).not.toBe(
        await background(page, '.meter-bar'),
      );
    }
  });
});
