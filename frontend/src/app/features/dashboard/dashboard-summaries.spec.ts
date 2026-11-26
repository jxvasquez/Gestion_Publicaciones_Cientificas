import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AdminSummaryComponent } from './admin-summary/admin-summary.component';
import { AuthorSummaryComponent } from './author-summary/author-summary.component';
import { ReviewerSummaryComponent } from './reviewer-summary/reviewer-summary.component';

/** Suite directa de los tres resúmenes del panel (TSK-28, spec 004). */

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
    metric: 'ranking_score',
    label: 'Puntaje de ranking',
    paths: ['/app/reviewer/assignments', '/app/reviewer/history'],
  },
  {
    component: AdminSummaryComponent,
    heading: 'Administrador',
    metric: 'open_incidents',
    label: 'Reportes abiertos',
    paths: [
      '/app/admin/incidents',
      '/app/admin/reviewers',
      '/app/admin/areas',
      '/app/admin/audit',
    ],
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

  const actions = (element: HTMLElement) =>
    Array.from(element.querySelectorAll<HTMLAnchorElement>('.kpi-card__actions a'), (link) => ({
      path: link.getAttribute('href'),
      tone: ['btn--primary', 'btn--ghost', 'btn--subtle'].filter((name) =>
        link.classList.contains(name),
      ),
    }));

  it.each(cases.map((entry) => [entry.heading, entry] as const))(
    '%s: un acceso principal con borde y los demás compactos, en el mismo orden',
    async (_, { component, metric, paths }) => {
      const fixture = await renderSummary(component, { [metric]: 3 });

      expect(actions(fixture.nativeElement as HTMLElement)).toEqual(
        paths.map((path, index) => ({
          path,
          tone: [index === 0 ? 'btn--ghost' : 'btn--subtle'],
        })),
      );
    },
  );

  it('la tarjeta del Administrador acompaña cada métrica con su icono', async () => {
    const fixture = await renderSummary(AdminSummaryComponent, {
      open_incidents: 0,
      awaiting_reviewers: 4,
    });
    const element = fixture.nativeElement as HTMLElement;
    const metrics = Array.from(element.querySelectorAll('.kpi-card__metric'), (metric) => [
      metric.querySelector('dt')?.textContent?.trim(),
      metric.querySelector('dt use')?.getAttribute('href'),
      metric.querySelector('dd')?.textContent?.trim(),
    ]);

    expect(metrics).toEqual([
      ['Reportes abiertos', 'icons/ui.svg#incident', '0'],
      ['Manuscritos esperando revisores', 'icons/ui.svg#hourglass', '4'],
    ]);
  });

  it('omite conteos no válidos y campos ajenos a la tarjeta en la vista del Revisor', async () => {
    const fixture = await renderSummary(ReviewerSummaryComponent, {
      ranking_score: '3',
      unexpected_count: 42,
      author: { name: 'Autor reservado', email: 'reservado@example.invalid' },
    });
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('dd')).toBeNull();
    expect(element.querySelector('app-empty-state')).not.toBeNull();
    expect(element.textContent).not.toMatch(/42|unexpected_count|Autor reservado|example\.invalid/);
  });

  it.each([
    [3, '60%', false],
    [5, '100%', true],
  ])(
    'con %i de 5 activas la tarjeta del Revisor dibuja la barra al %s',
    async (active, width, full) => {
      const fixture = await renderSummary(ReviewerSummaryComponent, {
        active_assignments: active,
        max_active_assignments: 5,
      });
      const element = fixture.nativeElement as HTMLElement;

      expect(
        element.querySelector<HTMLElement>('.meter-bar__fill')?.style.getPropertyValue('inline-size'),
      ).toBe(width);
      expect((element.textContent ?? '').includes('Cupo completo')).toBe(full);
    },
  );

  it('muestra el cupo del Revisor como «3/5», con el nombre accesible «3 de 5»', async () => {
    const fixture = await renderSummary(ReviewerSummaryComponent, {
      ranking_score: 110,
      active_assignments: 3,
      max_active_assignments: 5,
      pending_evaluations: 2,
      on_time_evaluations: 2,
      missed_deadlines: 1,
    });
    const element = fixture.nativeElement as HTMLElement;

    const metrics = Array.from(element.querySelectorAll('.kpi-card__metric'));
    const slot = metrics.find((metric) => metric.querySelector('dt')?.textContent?.includes('activas'));
    expect(slot?.querySelector('[aria-hidden="true"]')?.textContent?.trim()).toBe('3/5');
    expect(slot?.querySelector('.visually-hidden')?.textContent?.trim()).toBe('3 de 5');
    expect(metrics).toHaveLength(5);
  });
});
