import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { API_BASE_URL } from '../../../core/http/api-base-url.token';
import { RosterReviewer } from '../../../core/models/area.model';
import { AREA_SERVICE_STUB } from '../../../core/testing/stubs';
import { errorEnvelope } from '../../author/testing/manuscript.fixtures';
import { buildRosterReviewer } from '../testing/admin.fixtures';
import { ReviewerRosterComponent } from './reviewer-roster.component';

@Component({ template: '' })
class BlankComponent {}

const LIST = '/api/v1/admin/reviewers/';
const PAGE_URL = '/app/admin/reviewers';

describe('ReviewerRosterComponent', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeAll(() => {
    // jsdom no implementa el ciclo abierto/cerrado del diálogo nativo.
    if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
      HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      };
    }
    if (typeof HTMLDialogElement.prototype.close !== 'function') {
      HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      };
    }
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'app/admin/reviewers', component: ReviewerRosterComponent }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api/v1/' },
        AREA_SERVICE_STUB,
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  const text = (node: Element | null) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const listRequest = (): TestRequest => http.expectOne((r) => r.url === LIST);

  const page = (results: RosterReviewer[], count = results.length) => ({
    count,
    next: null,
    previous: null,
    results,
  });

  const open = async (url = PAGE_URL) => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, ReviewerRosterComponent);
    const element = harness.routeNativeElement as HTMLElement;
    const settle = async () => {
      await harness.fixture.whenStable();
      harness.detectChanges();
    };
    return { harness, element, settle };
  };

  const cells = (row: Element) => Array.from(row.querySelectorAll('td')).map((c) => text(c));

  describe('lista', () => {
    it('muestra carreras, ranking, carga «3/5», a tiempo, vencidas y estado', async () => {
      const { element, settle } = await open();
      listRequest().flush(page([buildRosterReviewer()]));
      await settle();

      const row = element.querySelector('tbody tr')!;
      expect(cells(row).slice(0, 7)).toEqual([
        'Rosa Revisorarosa@unl.edu.ec',
        'Derecho',
        '110',
        '3/5',
        '2',
        '1',
        'Disponible',
      ]);
      expect(text(element.querySelector('.list-header__count'))).toBe('1 revisor');
    });

    it('un revisor no disponible o sin carreras se distingue con texto', async () => {
      const { element, settle } = await open();
      listRequest().flush(page([buildRosterReviewer({ is_available: false, areas: [] })]));
      await settle();

      const row = element.querySelector('tbody tr')!;
      expect(cells(row)[1]).toBe('Sin carreras');
      expect(cells(row)[6]).toBe('No disponible');
    });

    it('sin resultados muestra el estado vacío', async () => {
      const { element, settle } = await open();
      listRequest().flush(page([]));
      await settle();

      expect(text(element.querySelector('app-empty-state'))).toContain('No hay revisores');
      expect(element.querySelector('table')).toBeNull();
    });

    it('un error del servidor ofrece reintentar', async () => {
      const { element, settle } = await open();
      listRequest().flush(errorEnvelope('SERVER_ERROR', 'Error.'), {
        status: 500,
        statusText: 'Server Error',
      });
      await settle();

      element.querySelector<HTMLButtonElement>('app-error-state button')!.click();
      await settle();
      listRequest().flush(page([buildRosterReviewer()]));
      await settle();

      expect(element.querySelectorAll('tbody tr')).toHaveLength(1);
    });

    it('la tabla es accesible: caption, encabezados con scope y región con nombre', async () => {
      const { element, settle } = await open();
      listRequest().flush(page([buildRosterReviewer()]));
      await settle();

      expect(element.querySelector('caption')).not.toBeNull();
      expect(element.querySelectorAll('th[scope="col"]').length).toBe(8);
      expect(element.querySelector('[role="region"]')?.getAttribute('aria-label')).toBe(
        'Tabla de revisores',
      );
    });
  });

  describe('filtros en la URL', () => {
    it('lee carrera, disponibilidad y búsqueda de la URL', async () => {
      const { element, settle } = await open(`${PAGE_URL}?area=derecho&available=false&search=rosa`);
      const request = listRequest();
      expect(request.request.params.get('area')).toBe('derecho');
      expect(request.request.params.get('available')).toBe('false');
      expect(request.request.params.get('search')).toBe('rosa');
      request.flush(page([]));
      await settle();

      expect((element.querySelector('#roster-area') as HTMLSelectElement).value).toBe('derecho');
      expect((element.querySelector('#roster-available') as HTMLSelectElement).value).toBe('false');
      expect((element.querySelector('#roster-search') as HTMLInputElement).value).toBe('rosa');
    });

    it('un valor de disponibilidad manipulado se ignora', async () => {
      const { settle } = await open(`${PAGE_URL}?available=quizas`);
      const request = listRequest();
      expect(request.request.params.has('available')).toBe(false);
      request.flush(page([]));
      await settle();
    });

    it('elegir una carrera lo deja en la URL y vuelve a pedir la lista', async () => {
      const { element, settle } = await open();
      listRequest().flush(page([buildRosterReviewer()]));
      await settle();

      const select = element.querySelector('#roster-area') as HTMLSelectElement;
      select.value = 'derecho';
      select.dispatchEvent(new Event('change'));
      await settle();

      expect(router.url).toBe(`${PAGE_URL}?area=derecho`);
      expect(listRequest().request.params.get('area')).toBe('derecho');
    });

    it('buscar por texto deja la búsqueda en la URL', async () => {
      const { element, settle } = await open();
      listRequest().flush(page([]));
      await settle();

      const input = element.querySelector('#roster-search') as HTMLInputElement;
      input.value = 'rosa';
      input.dispatchEvent(new Event('input'));
      (element.querySelector('form button[type="submit"]') as HTMLButtonElement).click();
      await settle();

      expect(router.url).toBe(`${PAGE_URL}?search=rosa`);
      listRequest().flush(page([]));
    });

    it('la paginación pide la página elegida', async () => {
      const { element, settle } = await open();
      listRequest().flush(page([buildRosterReviewer()], 45));
      await settle();

      expect(element.querySelector('app-pagination')).not.toBeNull();
      await router.navigateByUrl(`${PAGE_URL}?page=2`);
      expect(listRequest().request.params.get('page')).toBe('2');
    });
  });

  describe('edición', () => {
    const dialog = (element: HTMLElement) =>
      element.querySelector('app-reviewer-edit-dialog dialog') as HTMLDialogElement;
    const editButton = (element: HTMLElement) =>
      element.querySelector<HTMLButtonElement>('button[aria-label="Editar a Rosa Revisora"]')!;

    it('«Editar» es una acción compacta en cada fila', async () => {
      const { element, settle } = await open();
      listRequest().flush(page([buildRosterReviewer()]));
      await settle();

      expect(editButton(element).classList).toContain('btn--subtle');
      expect(editButton(element).classList).not.toContain('btn--ghost');
    });

    it('«Editar» abre el diálogo con el revisor, sin enviar nada', async () => {
      const { element, settle } = await open();
      listRequest().flush(page([buildRosterReviewer()]));
      await settle();

      editButton(element).click();
      await settle();

      expect(dialog(element).hasAttribute('open')).toBe(true);
      expect(text(dialog(element))).toContain('Rosa Revisora');
    });

    it('guardar envía PATCH, cierra, avisa y actualiza la fila sin recargar', async () => {
      const { element, settle } = await open();
      listRequest().flush(page([buildRosterReviewer()]));
      await settle();
      editButton(element).click();
      await settle();

      const box = dialog(element).querySelector<HTMLInputElement>('fieldset input[value="agronomia"]')!;
      box.checked = true;
      box.dispatchEvent(new Event('change'));
      await settle();
      Array.from(dialog(element).querySelectorAll('button'))
        .find((b) => text(b) === 'Guardar cambios')!
        .click();
      await settle();

      const request = http.expectOne('/api/v1/admin/reviewers/u-1/');
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({
        areas: ['derecho', 'agronomia'],
        is_available: true,
      });
      request.flush(
        buildRosterReviewer({
          areas: [
            { code: 'derecho', name: 'Derecho' },
            { code: 'agronomia', name: 'Agronomía' },
          ],
        }),
      );
      await settle();

      expect(dialog(element).hasAttribute('open')).toBe(false);
      expect(text(element.querySelector('[role="status"].callout'))).toBe(
        'Se actualizó a Rosa Revisora.',
      );
      expect(cells(element.querySelector('tbody tr')!)[1]).toBe('Derecho, Agronomía');
    });

    it('un error del servidor se muestra en el diálogo y lo deja abierto', async () => {
      const { element, settle } = await open();
      listRequest().flush(page([buildRosterReviewer()]));
      await settle();
      editButton(element).click();
      await settle();
      Array.from(dialog(element).querySelectorAll('button'))
        .find((b) => text(b) === 'Guardar cambios')!
        .click();
      await settle();

      http.expectOne('/api/v1/admin/reviewers/u-1/').flush(
        errorEnvelope('VALIDATION_ERROR', 'Carrera no válida.'),
        { status: 400, statusText: 'Bad Request' },
      );
      await settle();

      expect(dialog(element).hasAttribute('open')).toBe(true);
      expect(text(dialog(element).querySelector('[role="alert"]'))).not.toBe('');
    });
  });
});
