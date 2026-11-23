import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AdminSummaryComponent } from './admin-summary/admin-summary.component';
import { AuthorSummaryComponent } from './author-summary/author-summary.component';
import { EditorSummaryComponent } from './editor-summary/editor-summary.component';
import { ReviewerSummaryComponent } from './reviewer-summary/reviewer-summary.component';

/** Suite directa de los cuatro resúmenes del panel (TSK-28). */

const renderSummary = async (
  component: Type<unknown>,
  data: Record<string, unknown> | null,
) => {
  const fixture = TestBed.createComponent(component);
  fixture.componentRef.setInput('data', data);
  await fixture.whenStable();
  return fixture;
};

const cases = [
  {
    component: AuthorSummaryComponent,
    heading: 'Autor',
    metric: 'manuscripts',
    label: 'Manuscritos',
    paths: ['/app/author/manuscripts'],
  },
  {
    component: ReviewerSummaryComponent,
    heading: 'Revisor',
    metric: 'pending',
    label: 'Asignaciones pendientes',
    paths: ['/app/reviewer/assignments', '/app/reviewer/history'],
  },
  {
    component: EditorSummaryComponent,
    heading: 'Editor',
    metric: 'new_submissions',
    label: 'Nuevos envíos',
    paths: [
      '/app/editor/submissions',
      '/app/editor/assignments/expired',
      '/app/editor/incidents',
    ],
  },
  {
    component: AdminSummaryComponent,
    heading: 'Administrador',
    metric: 'audit_events',
    label: 'Eventos de auditoría',
    paths: ['/app/admin/audit'],
  },
] as const;

describe('Resúmenes del panel unificado (TSK-28)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  for (const { component, heading, metric, label, paths } of cases) {
    describe(heading, () => {
      it('muestra el encabezado y el conteo autorizado con su etiqueta', async () => {
        const fixture = await renderSummary(component, { [metric]: 3 });
        const element = fixture.nativeElement as HTMLElement;

        expect(element.querySelector('app-kpi-card h2')?.textContent?.trim()).toBe(heading);
        expect(element.querySelector('dt')?.textContent?.trim()).toBe(label);
        expect(element.querySelector('dd .badge')?.textContent?.trim()).toBe('3');
      });

      it('muestra cero cuando el conteo está disponible', async () => {
        const fixture = await renderSummary(component, { [metric]: 0 });
        const element = fixture.nativeElement as HTMLElement;

        expect(element.querySelector('dd .badge')?.textContent?.trim()).toBe('0');
        expect(element.querySelector('app-empty-state')).toBeNull();
      });

      it.each([null, {}])('anuncia el estado vacío y conserva los accesos con datos %j', async (data) => {
        const fixture = await renderSummary(component, data);
        const element = fixture.nativeElement as HTMLElement;

        expect(element.querySelector('app-kpi-card h2')?.textContent?.trim()).toBe(heading);
        expect(element.querySelector('[role="status"]')?.textContent).toContain(
          'Todavía no hay métricas disponibles.',
        );
        expect(element.querySelector('dd')).toBeNull();
        expect(Array.from(element.querySelectorAll('a'), (link) => link.getAttribute('href'))).toEqual(
          paths,
        );
      });
    });
  }

  it('omite conteos no válidos y campos ajenos a la tarjeta en la vista del Revisor', async () => {
    const fixture = await renderSummary(ReviewerSummaryComponent, {
      pending: '3',
      unexpected_count: 42,
      author: { name: 'Autor reservado', email: 'reservado@example.invalid' },
    });
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('dd')).toBeNull();
    expect(element.querySelector('app-empty-state')).not.toBeNull();
    expect(element.textContent).not.toMatch(/42|unexpected_count|Autor reservado|example\.invalid/);
  });
});
