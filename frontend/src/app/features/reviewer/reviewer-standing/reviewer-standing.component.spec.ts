import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL } from '../../../core/http/api-base-url.token';
import { RankingAdjustment, ReviewerStanding } from '../../../core/models/reviewer.model';
import { errorEnvelope } from '../../author/testing/manuscript.fixtures';
import { ReviewerStandingComponent } from './reviewer-standing.component';

const STANDING: ReviewerStanding = {
  ranking_score: 110,
  active_assignments: 3,
  max_active_assignments: 5,
  on_time_evaluations: 2,
  missed_deadlines: 1,
  is_available: true,
  areas: [{ code: 'derecho', name: 'Derecho' }],
};

const adjustment = (overrides: Partial<RankingAdjustment> = {}): RankingAdjustment => ({
  id: 1,
  created_at: '2026-11-24T15:00:00Z',
  cause: 'ON_TIME_EVALUATION',
  delta: 10,
  score_after: 110,
  manuscript_code: 'GPC-2026-000042',
  version_number: 1,
  ...overrides,
});

describe('ReviewerStandingComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api/v1/' },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const render = async (rows: RankingAdjustment[], count = rows.length) => {
    const fixture = TestBed.createComponent(ReviewerStandingComponent);
    await fixture.whenStable();
    http.expectOne('/api/v1/reviewer/standing/').flush(STANDING);
    http
      .expectOne((r) => r.url === '/api/v1/reviewer/standing/adjustments/')
      .flush({ count, next: null, previous: null, results: rows });
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('muestra el puntaje, «3/5» activas, las evaluadas a tiempo y los vencimientos', async () => {
    const element = await render([adjustment()]);

    const metrics = Array.from(element.querySelectorAll('.kpi-card__metric')).map((m) =>
      (m.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
    expect(metrics[0]).toContain('110');
    expect(metrics[1]).toContain('3/5');
    expect(metrics[2]).toContain('2');
    expect(metrics[3]).toContain('1');
  });

  it('la tabla de ajustes dice «+10 a tiempo» y «−20 vencida» con texto, no solo con color', async () => {
    const element = await render([
      adjustment({ id: 2, cause: 'DEADLINE_MISSED', delta: -20, score_after: 90 }),
      adjustment({ id: 1 }),
    ]);

    const badges = Array.from(element.querySelectorAll('tbody .badge')).map((b) => b.textContent?.trim());
    expect(badges).toEqual(['−20 vencida', '+10 a tiempo']);
    expect(element.querySelector('tbody .badge--danger')).not.toBeNull();
    expect(element.querySelector('tbody .badge--success')).not.toBeNull();
    expect(element.textContent).toContain('GPC-2026-000042 · v1');
  });

  it('sin ajustes muestra el estado vacío', async () => {
    const element = await render([]);

    expect(element.querySelector('app-empty-state')?.textContent).toContain(
      'Todavía no tiene ajustes en su ranking.',
    );
    expect(element.querySelector('table')).toBeNull();
  });

  it('pagina el historial de ajustes', async () => {
    const element = await render([adjustment()], 25);

    expect(element.querySelector('app-pagination')).not.toBeNull();
  });

  it('un error del desempeño muestra un estado con reintento', async () => {
    const fixture = TestBed.createComponent(ReviewerStandingComponent);
    await fixture.whenStable();
    http
      .expectOne('/api/v1/reviewer/standing/')
      .flush(errorEnvelope('SERVER_ERROR', 'Error.'), { status: 500, statusText: 'Server Error' });
    http
      .expectOne((r) => r.url === '/api/v1/reviewer/standing/adjustments/')
      .flush({ count: 0, next: null, previous: null, results: [] });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-error-state')).not.toBeNull();
  });
});
