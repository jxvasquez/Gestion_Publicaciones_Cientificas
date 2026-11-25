import { TestBed } from '@angular/core/testing';

import { KpiCardComponent } from './kpi-card.component';

const render = async (metrics: { label: string; value: unknown; max?: unknown }[]) => {
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
