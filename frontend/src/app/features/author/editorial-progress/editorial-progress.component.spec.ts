import { TestBed } from '@angular/core/testing';

import { MANUSCRIPT_STATUSES, ManuscriptStatus } from '../../../core/models/manuscript.model';
import { EditorialProgressComponent } from './editorial-progress.component';

describe('EditorialProgressComponent', () => {
  const render = async (status: ManuscriptStatus, is_active = true) => {
    const fixture = TestBed.createComponent(EditorialProgressComponent);
    fixture.componentRef.setInput('manuscript', { status, is_active });
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const items = Array.from(element.querySelectorAll<HTMLLIElement>('li'));
    return { fixture, element, items };
  };

  const text = (node: Element) => (node.textContent ?? '').replace(/\s+/g, ' ').trim();
  const label = (item: Element) => text(item.querySelector('.progress__label')!);
  const spoken = (item: Element) => text(item.querySelector('.visually-hidden')!);

  it('es una lista ordenada de cuatro etapas con nombre accesible', async () => {
    const { element, items } = await render('UNDER_REVIEW');
    const list = element.querySelector('ol')!;

    expect(list.getAttribute('aria-label')).toBe('Progreso del ciclo editorial');
    expect(items).toHaveLength(4);
    expect(items.map(label)).toEqual(['Borrador', 'Enviado', 'En revisión', 'Decisión']);
  });

  it('dice en texto qué etapas están completadas, cuál es la actual y cuáles faltan', async () => {
    const { items } = await render('UNDER_REVIEW');

    expect(items.map(spoken)).toEqual([
      ', completada',
      ', completada',
      ', etapa actual',
      ', pendiente',
    ]);
    expect(items.map((item) => item.getAttribute('aria-current'))).toEqual([
      null,
      null,
      'step',
      null,
    ]);
  });

  it('las completadas llevan el icono de verificación y las demás su número', async () => {
    const { items } = await render('UNDER_REVIEW');
    const marker = (item: Element) => item.querySelector('.progress__marker')!;

    expect(items.map((item) => marker(item).querySelector('use')?.getAttribute('href'))).toEqual([
      'icons/ui.svg#check',
      'icons/ui.svg#check',
      undefined,
      undefined,
    ]);
    expect(items.slice(2).map((item) => text(marker(item)))).toEqual(['3', '4']);
    for (const item of items) {
      expect(marker(item).getAttribute('aria-hidden')).toBe('true');
    }
  });

  it.each([
    ['TIE_BREAKER', 2, 'En desempate', 'info'],
    ['CHANGES_REQUESTED', 3, 'Cambios solicitados', 'warning'],
    ['ACCEPTED', 3, 'Aceptado', 'success'],
    ['REJECTED', 3, 'Rechazado', 'danger'],
  ] as const)('%s rotula su etapa «%s» con su tono', async (status, index, expected, tone) => {
    const { items } = await render(status);

    expect(label(items[index])).toBe(expected);
    expect(items[index].classList).toContain(`progress__stage--${tone}`);
  });

  it.each(['ACCEPTED', 'REJECTED'] as const)(
    '%s: todas completadas y ninguna actual',
    async (status) => {
      const { element, items } = await render(status);

      expect(items.map(spoken)).toEqual(Array(4).fill(', completada'));
      expect(element.querySelector('[aria-current]')).toBeNull();
    },
  );

  it('con cambios solicitados explica que una nueva versión vuelve a revisión', async () => {
    const { element } = await render('CHANGES_REQUESTED');

    expect(text(element.querySelector('.progress__note')!)).toBe(
      'Al enviar una nueva versión, el manuscrito vuelve a la etapa En revisión.',
    );
  });

  it.each(['UNDER_REVIEW', 'ACCEPTED'] as const)('en %s no hay nota', async (status) => {
    const { element } = await render(status);

    expect(element.querySelector('.progress__note')).toBeNull();
  });

  it('dado de baja conserva la etapa alcanzada, sin nota ni etapas futuras activas', async () => {
    const { element, items } = await render('CHANGES_REQUESTED', false);

    expect(label(items[3])).toBe('Dado de baja');
    expect(items[3].classList).toContain('progress__stage--neutral');
    expect(element.querySelector('.progress__note')).toBeNull();
    const withdrawn = await render('SUBMITTED', false);
    expect(withdrawn.items.map(spoken)).toEqual([
      ', completada',
      ', etapa actual',
      ', pendiente',
      ', pendiente',
    ]);
  });

  it('se actualiza cuando cambia el manuscrito', async () => {
    const { fixture, items } = await render('DRAFT');

    fixture.componentRef.setInput('manuscript', { status: 'TIE_BREAKER', is_active: true });
    await fixture.whenStable();

    expect(items[2].getAttribute('aria-current')).toBe('step');
    expect(label(items[2])).toBe('En desempate');
  });

  it.each(MANUSCRIPT_STATUSES)('en %s no muestra datos de los revisores', async (status) => {
    const { element } = await render(status);

    expect(element.textContent).not.toContain('Revisor');
    expect(element.textContent).not.toMatch(/dictamen|puntaje|ranking/i);
  });
});
