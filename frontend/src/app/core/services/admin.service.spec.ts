import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiError } from '../models/api-error.model';
import {
  buildAdminArea,
  buildIncident,
  buildIncidentPage,
  buildRosterReviewer,
} from '../../features/admin/testing/admin.fixtures';
import { errorEnvelope } from '../../features/author/testing/manuscript.fixtures';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api/v1/' },
      ],
    });
    service = TestBed.inject(AdminService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('incidentes', () => {
    it('lista con el filtro de estado y la página; «Todos» no envía filtro', () => {
      service.listIncidents('OPEN', 2, 20).subscribe();
      const open = http.expectOne((r) => r.url === '/api/v1/admin/incidents/');
      expect(open.request.params.get('status')).toBe('OPEN');
      expect(open.request.params.get('page')).toBe('2');
      open.flush(buildIncidentPage([buildIncident()]));

      service.listIncidents('ALL').subscribe();
      const all = http.expectOne((r) => r.url === '/api/v1/admin/incidents/');
      expect(all.request.params.has('status')).toBe(false);
      all.flush(buildIncidentPage([]));
    });

    it('resuelve con la resolución elegida', () => {
      service.resolveIncident('i-1', 'REASSIGN').subscribe();

      const request = http.expectOne('/api/v1/admin/incidents/i-1/resolve/');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ resolution: 'REASSIGN' });
      request.flush(buildIncident({ status: 'RESOLVED', resolution: 'REASSIGN' }));
    });

    it('normaliza el 409 de un segundo intento', () => {
      let failure: ApiError | undefined;
      service.resolveIncident('i-1', 'DISMISS').subscribe({ error: (e: ApiError) => (failure = e) });

      http
        .expectOne('/api/v1/admin/incidents/i-1/resolve/')
        .flush(errorEnvelope('STATE_CONFLICT', 'El incidente ya fue resuelto.'), {
          status: 409,
          statusText: 'Conflict',
        });

      expect(failure?.status).toBe(409);
    });

    it('descarga el documento sanitizado con el nombre genérico', () => {
      let result: { filename: string } | undefined;
      service
        .downloadIncidentDocument({ id: 'i-1', manuscript_code: 'GPC-2026-000001', version_number: 2 })
        .subscribe((value) => (result = value));

      const request = http.expectOne('/api/v1/admin/incidents/i-1/document/');
      expect(request.request.responseType).toBe('blob');
      request.flush(new Blob(['%PDF']));
      expect(result?.filename).toBe('manuscript-GPC-2026-000001-v2.pdf');
    });
  });

  describe('corrección de veredictos', () => {
    const correction = {
      manuscript_code: 'GPC-2026-000001',
      verdict: {
        id: 'v-2',
        decision: 'ACCEPTED',
        origin: 'ADMIN_CORRECTION',
        created_at: '2026-10-23T15:00:00Z',
        previous_verdict: 'v-1',
      },
      correction: {
        id: 'co-1',
        reason: 'Error de captura en la decisión.',
        authorized_at: '2026-10-23T15:00:00Z',
        consumed_at: '2026-10-23T15:00:00Z',
      },
    };

    it('envía la decisión, el motivo y la clave de idempotencia', () => {
      let result: unknown;
      service
        .correctVerdict('v-1', { decision: 'ACCEPTED', reason: 'Error de captura en la decisión.' }, 'key-1')
        .subscribe((value) => (result = value));

      const request = http.expectOne('/api/v1/admin/verdicts/v-1/correct/');
      expect(request.request.method).toBe('POST');
      expect(request.request.headers.get('Idempotency-Key')).toBe('key-1');
      expect(request.request.body).toEqual({
        decision: 'ACCEPTED',
        reason: 'Error de captura en la decisión.',
      });
      request.flush(correction, { status: 201, statusText: 'Created' });
      expect(result).toEqual(correction);
    });

    it('con «Cambios solicitados» viajan también las observaciones y se codifica el id', () => {
      service
        .correctVerdict(
          'a/b',
          { decision: 'CHANGES_REQUESTED', reason: 'Motivo suficiente.', observations: 'Ampliar.' },
          'key-2',
        )
        .subscribe();

      const request = http.expectOne('/api/v1/admin/verdicts/a%2Fb/correct/');
      expect(request.request.body.observations).toBe('Ampliar.');
      request.flush(correction);
    });

    it.each([
      [403, 'FORBIDDEN'],
      [409, 'CORRECTION_NOT_AUTHORIZED'],
    ])('normaliza el error %i', (status, code) => {
      let failure: ApiError | undefined;
      service
        .correctVerdict('v-1', { decision: 'REJECTED', reason: 'Motivo suficiente.' }, 'k')
        .subscribe({ error: (e: ApiError) => (failure = e) });

      http
        .expectOne('/api/v1/admin/verdicts/v-1/correct/')
        .flush(errorEnvelope(code, 'Rechazado.'), { status, statusText: 'Error' });

      expect(failure?.code).toBe(code);
    });
  });

  describe('padrón de revisores', () => {
    it('envía los filtros y la disponibilidad como texto', () => {
      service.listReviewers({ area: 'derecho', available: false, search: 'rosa', page: 3 }).subscribe();

      const request = http.expectOne((r) => r.url === '/api/v1/admin/reviewers/');
      expect(request.request.params.get('area')).toBe('derecho');
      expect(request.request.params.get('available')).toBe('false');
      expect(request.request.params.get('search')).toBe('rosa');
      expect(request.request.params.get('page')).toBe('3');
      request.flush({ count: 0, next: null, previous: null, results: [] });
    });

    it('modifica carreras y disponibilidad con PATCH', () => {
      service.updateReviewer('u-1', { areas: ['derecho'], is_available: false }).subscribe();

      const request = http.expectOne('/api/v1/admin/reviewers/u-1/');
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({ areas: ['derecho'], is_available: false });
      request.flush(buildRosterReviewer({ is_available: false }));
    });
  });

  describe('catálogo de carreras', () => {
    it('lista, crea y modifica sin cambiar el código', () => {
      service.listAreas().subscribe();
      http.expectOne('/api/v1/admin/areas/').flush([buildAdminArea()]);

      service.createArea('Ingeniería Civil').subscribe();
      const created = http.expectOne('/api/v1/admin/areas/');
      expect(created.request.method).toBe('POST');
      expect(created.request.body).toEqual({ name: 'Ingeniería Civil' });
      created.flush(buildAdminArea({ code: 'ingenieria-civil', name: 'Ingeniería Civil' }));

      service.updateArea('derecho', { is_active: false }).subscribe();
      const updated = http.expectOne('/api/v1/admin/areas/derecho/');
      expect(updated.request.method).toBe('PATCH');
      expect(updated.request.body).toEqual({ is_active: false });
      updated.flush(buildAdminArea({ is_active: false }));
    });
  });
});
