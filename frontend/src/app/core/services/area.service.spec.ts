import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { errorEnvelope } from '../../features/author/testing/manuscript.fixtures';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiError } from '../models/api-error.model';
import { AreaService } from './area.service';

const AREAS = [
  { code: 'derecho', name: 'Derecho' },
  { code: 'medicina', name: 'Medicina' },
];

describe('AreaService', () => {
  let service: AreaService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api/v1/' },
      ],
    });
    service = TestBed.inject(AreaService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('pide las carreras activas una sola vez y comparte la respuesta', () => {
    const results: unknown[] = [];
    service.list().subscribe((areas) => results.push(areas));
    service.list().subscribe((areas) => results.push(areas));

    http.expectOne('/api/v1/areas/').flush(AREAS);

    expect(results).toEqual([AREAS, AREAS]);

    // Una consulta posterior reutiliza lo ya recibido: no hay otra petición.
    service.list().subscribe((areas) => results.push(areas));
    expect(results).toHaveLength(3);
  });

  it('descarta la petición fallida: el siguiente intento vuelve a pedir', () => {
    let failure: ApiError | undefined;
    service.list().subscribe({ error: (error: ApiError) => (failure = error) });
    http
      .expectOne('/api/v1/areas/')
      .flush(errorEnvelope('SERVER_ERROR', 'Error.'), { status: 500, statusText: 'Server Error' });
    expect(failure?.status).toBe(500);

    let retried: unknown;
    service.list().subscribe((areas) => (retried = areas));
    http.expectOne('/api/v1/areas/').flush(AREAS);

    expect(retried).toEqual(AREAS);
  });
});
