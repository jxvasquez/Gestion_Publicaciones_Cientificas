import { TestBed } from '@angular/core/testing';

import { KpiCardComponent } from './kpi-card.component';

const render = async (
  metrics: { label: string; value: unknown; max?: unknown; icon?: string; fullLabel?: string }[],
) => {
  const fixture = TestBed.createComponent(KpiCardComponent);
  fixture.componentRef.setInput('title', 'Revisor');
  fixture.componentRef.setInput('icon', 'reviewer');
  fixture.componentRef.setInput('metrics', metrics);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
};

describe('KpiCardComponent', () => {
  it('con `max` muestra «3/5» y su nombre accesible es «3 de 5»', async () => {
    const element = await render([{ label: 'Asignaciones activas', value: 3, max: 5 }]);

    expect(element.querySelector('dd [aria-hidden="true"]')?.textContent?.trim()).toBe('3/5');
    expect(element.querySelector('dd .visually-hidden')?.textContent?.trim()).toBe('3 de 5');
  });

  it('sin `max` se muestra igual que antes', async () => {
    const element = await render([{ label: 'Evaluadas a tiempo', value: 2 }]);

    expect(element.querySelector('dd .badge')?.textContent?.trim()).toBe('2');
    expect(element.querySelector('dd .visually-hidden')).toBeNull();
  });

  const slot = (value: number) => ({
    label: 'Asignaciones activas',
    value,
    max: 5,
    fullLabel: 'Cupo completo',
  });
  const fill = (element: HTMLElement) =>
    element.querySelector<HTMLElement>('.meter-bar__fill')!;
  const width = (element: HTMLElement) => fill(element).style.getPropertyValue('inline-size');

  it.each([
    [0, '0%'],
    [3, '60%'],
  ])('con %i de 5 dibuja una barra decorativa al %s', async (value, expected) => {
    const element = await render([slot(value)]);

    expect(element.querySelector('.meter-bar')?.getAttribute('aria-hidden')).toBe('true');
    expect(width(element)).toBe(expected);
    expect(fill(element).classList).not.toContain('meter-bar__fill--warning');
    expect(element.textContent).not.toContain('Cupo completo');
    // La barra no desplaza a «X/Y», que es lo que leen las pruebas E2E.
    expect(element.querySelector('dd [aria-hidden="true"]')?.textContent?.trim()).toBe(
      `${value}/5`,
    );
  });

  it('con el cupo completo la barra está llena, en advertencia y con texto visible', async () => {
    const element = await render([slot(5)]);

    expect(width(element)).toBe('100%');
    expect(fill(element).classList).toContain('meter-bar__fill--warning');
    const full = element.querySelector('.kpi-card__full')!;
    expect(full.textContent?.trim()).toBe('Cupo completo');
    expect(full.closest('[aria-hidden="true"]')).toBeNull();
  });

  it('un valor mayor que el máximo llena la barra sin desbordarla y conserva el texto', async () => {
    const element = await render([slot(7)]);

    expect(width(element)).toBe('100%');
    expect(element.querySelector('dd [aria-hidden="true"]')?.textContent?.trim()).toBe('7/5');
    expect(element.textContent).toContain('Cupo completo');
  });

  it('sin `fullLabel` la barra llena no añade texto y no lo lee el lector de pantalla', async () => {
    const element = await render([{ label: 'Activas', value: 5, max: 5 }]);

    expect(width(element)).toBe('100%');
    expect(element.querySelector('.kpi-card__full')).toBeNull();
    expect(element.querySelector('.kpi-card__meter')?.getAttribute('aria-hidden')).toBe('true');
  });

  it.each([undefined, null, -1, '5'])('sin un máximo válido (%j) no hay barra', async (max) => {
    // Sin `slot()`: pasarle `undefined` activaría su máximo por defecto.
    const element = await render([{ ...slot(3), max }]);

    expect(element.querySelector('.meter-bar')).toBeNull();
    expect(element.textContent).not.toContain('Cupo completo');
  });

  it.each(['incident', 'hourglass'])(
    'con `icon: %s` dibuja un icono decorativo junto a la etiqueta',
    async (icon) => {
      const element = await render([{ label: 'Reportes abiertos', value: 2, icon }]);
      const term = element.querySelector('dt')!;

      expect(term.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
      expect(term.querySelector('use')?.getAttribute('href')).toBe(`icons/ui.svg#${icon}`);
      expect(term.textContent?.trim()).toBe('Reportes abiertos');
    },
  );

  it('sin `icon` la etiqueta no lleva dibujo', async () => {
    const element = await render([{ label: 'Activas', value: 3 }]);

    expect(element.querySelector('dt svg')).toBeNull();
  });

  it.each([-1, 2.5, '5', null])('un `max` no válido (%j) se ignora', async (max) => {
    const element = await render([{ label: 'Activas', value: 3, max }]);

    expect(element.querySelector('dd .badge')?.textContent?.trim()).toBe('3');
  });

  it.each([-1, 1.5, '3', null, undefined])('un valor no válido (%j) no se muestra', async (value) => {
    const element = await render([{ label: 'Activas', value, max: 5 }]);

    expect(element.querySelector('dd')).toBeNull();
    expect(element.textContent).toContain('Todavía no hay métricas disponibles.');
  });
});
