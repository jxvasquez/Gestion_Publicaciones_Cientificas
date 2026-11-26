import { expect, Locator, Page } from '@playwright/test';

/**
 * Contraste medido sobre los estilos computados (spec 005, SC-002): lo que axe no ve, es
 * decir, los estados al pasar el puntero, con foco y con error, los bordes y los anillos.
 */
const TEXT = 4.5;
const NON_TEXT = 3;

export type State = 'reposo' | 'hover' | 'foco' | 'error';
export type Metric = 'texto' | 'borde' | 'anillo';

export interface Sample {
  target: string;
  state: State;
  metric: Metric;
  ratio: number;
  min: number;
}

export interface Reading {
  text: number;
  /** `null` sin borde visible. */
  border: number | null;
  /** `null` sin anillo de foco visible. */
  ring: number | null;
}

/** Ratios del elemento: su texto sobre su fondo, y borde y anillo sobre lo que lo rodea. */
export async function read(element: Locator): Promise<Reading> {
  return element.evaluate((node) => {
    type Color = [number, number, number, number];
    const parse = (value: string): Color => {
      const [r, g, b, a = 1] = (value.match(/[\d.]+/g) ?? []).map(Number);
      return [r, g, b, a];
    };
    const over = (top: Color, under: Color): Color => [
      top[0] * top[3] + under[0] * (1 - top[3]),
      top[1] * top[3] + under[1] * (1 - top[3]),
      top[2] * top[3] + under[2] * (1 - top[3]),
      1,
    ];
    /** Fondo efectivo: se componen las capas desde el elemento hasta la primera opaca. */
    const backgroundOf = (from: Element | null): Color => {
      const layers: Color[] = [];
      for (let n = from; n; n = n.parentElement) {
        const color = parse(getComputedStyle(n).backgroundColor);
        if (color[3] > 0) {
          layers.push(color);
        }
        if (color[3] === 1) {
          break;
        }
      }
      return layers.reduceRight<Color>((under, top) => over(top, under), [255, 255, 255, 1]);
    };
    const luminance = ([r, g, b]: Color): number => {
      const channel = (c: number) =>
        c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4;
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const ratio = (first: Color, second: Color): number => {
      const [high, low] = [luminance(first), luminance(second)].sort((a, b) => b - a);
      return (high + 0.05) / (low + 0.05);
    };

    const style = getComputedStyle(node);
    const own = backgroundOf(node);
    const around = backgroundOf(node.parentElement);
    const hasBorder =
      style.borderTopStyle !== 'none' &&
      parseFloat(style.borderTopWidth) > 0 &&
      parse(style.borderTopColor)[3] > 0;
    const hasRing = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
    return {
      text: ratio(over(parse(style.color), own), own),
      border: hasBorder ? ratio(over(parse(style.borderTopColor), around), around) : null,
      ring: hasRing ? ratio(over(parse(style.outlineColor), around), around) : null,
    };
  });
}

/** Variantes compartidas que se miden aunque la vista todavía no las use. */
const PROBE = `
  <button type="button" class="btn btn--primary" data-probe="btn--primary">Primario</button>
  <button type="button" class="btn btn--success" data-probe="btn--success">Éxito</button>
  <button type="button" class="btn btn--danger" data-probe="btn--danger">Destructivo</button>
  <button type="button" class="btn btn--ghost" data-probe="btn--ghost">Con borde</button>
  <button type="button" class="btn btn--subtle" data-probe="btn--subtle">Compacto</button>
  <button type="button" class="btn btn--ghost btn--danger-text" data-probe="ghost danger-text">Quitar</button>
  <button type="button" class="btn btn--subtle btn--danger-text" data-probe="subtle danger-text">Quitar</button>
  <a href="#probe" data-probe="enlace">Enlace</a>
  <input type="text" aria-label="Prueba de texto" value="Texto" data-probe="campo de texto">
  <select aria-label="Prueba de lista" data-probe="lista"><option>Opción</option></select>
  <textarea aria-label="Prueba de área" data-probe="área de texto">Texto</textarea>
  <span class="badge badge--success" data-probe="insignia ACCEPTED y +10">Aceptado</span>
  <span class="badge badge--warning" data-probe="insignia CHANGES_REQUESTED">Cambios solicitados</span>
  <span class="badge badge--info" data-probe="insignia TIE_BREAKER">En desempate</span>
  <span class="badge badge--danger" data-probe="insignia REJECTED y -20">Rechazado</span>
  <span class="badge badge--neutral" data-probe="insignia neutra">Borrador</span>
`;

/** Añade las variantes sobre el fondo de trabajo y dentro de una tarjeta. */
async function addProbes(page: Page): Promise<void> {
  await page.evaluate((html) => {
    const main = document.querySelector('main#main-content')!;
    for (const [surface, className] of [
      ['fondo', ''],
      ['tarjeta', 'card'],
    ]) {
      const box = document.createElement('div');
      box.className = className;
      box.dataset['surface'] = surface;
      box.style.cssText = 'display:flex;flex-wrap:wrap;gap:1rem;padding:1rem';
      box.innerHTML = html;
      main.appendChild(box);
    }
  }, PROBE);
}

interface Target {
  name: string;
  element: Locator;
}

/** Las variantes de prueba y el primer control real de cada tipo que haya en la vista. */
async function targets(page: Page): Promise<Target[]> {
  const found: Target[] = [];
  for (const element of await page.locator('[data-probe]').all()) {
    const name = await element.evaluate(
      (n) => `${n.getAttribute('data-probe')} sobre ${n.parentElement!.dataset['surface']}`,
    );
    found.push({ name, element });
  }
  const seen = new Set<string>();
  const real = page.locator(
    'main :is(a[href], .btn, .badge, input:not([type=checkbox], [type=radio], [type=file]), select, textarea):visible:not(:disabled):not([data-probe])',
  );
  for (const element of await real.all()) {
    const kind = await element.evaluate((n) => `${n.tagName.toLowerCase()}.${n.className}`);
    if (!seen.has(kind)) {
      seen.add(kind);
      found.push({ name: `real ${kind}`, element });
    }
  }
  found.push({ name: 'enlace de salto', element: page.locator('.skip-link') });
  return found;
}

/** Foco por teclado, para que el navegador aplique `:focus-visible`. */
async function keyboardFocus(page: Page, element: Locator): Promise<void> {
  await element.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(element).toBeFocused();
}

/** Mide texto, bordes y anillos de la vista actual en reposo, hover, foco y error. */
export async function measureView(page: Page): Promise<Sample[]> {
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important}' });
  await addProbes(page);
  const samples: Sample[] = [];

  for (const { name, element } of await targets(page)) {
    const { field, bordered, focusable } = await element.evaluate((n) => ({
      field: n.matches('input, select, textarea'),
      bordered: n.matches('input, select, textarea, .btn--ghost'),
      focusable: n.matches('a[href], button, input, select, textarea'),
    }));
    const skip = name === 'enlace de salto';
    const take = async (state: State): Promise<Reading> => {
      const reading = await read(element);
      const add = (metric: Metric, ratio: number, min: number) =>
        samples.push({ target: name, state, metric, ratio, min });
      add('texto', reading.text, TEXT);
      if (bordered) {
        add('borde', reading.border ?? 0, NON_TEXT);
      }
      if (state === 'foco') {
        add('anillo', reading.ring ?? 0, NON_TEXT);
      }
      return reading;
    };

    await page.mouse.move(0, 0);
    // El enlace de salto solo está en pantalla mientras tiene el foco.
    if (!skip) {
      await take('reposo');
      await element.hover();
      await take('hover');
      await page.mouse.move(0, 0);
    }
    if (focusable) {
      await keyboardFocus(page, element);
      await take('foco');
      await element.blur();
    }
    if (field) {
      await element.evaluate((n) => n.setAttribute('aria-invalid', 'true'));
      await take('error');
      await element.evaluate((n) => n.removeAttribute('aria-invalid'));
    }
  }
  return samples;
}
