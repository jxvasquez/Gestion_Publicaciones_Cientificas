import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL } from '../../../core/http/api-base-url.token';
import { errorEnvelope } from '../../author/testing/manuscript.fixtures';
import { buildAdminArea } from '../testing/admin.fixtures';
import { AreaCatalogComponent } from './area-catalog.component';

const URL = '/api/v1/admin/areas/';

describe('AreaCatalogComponent', () => {
  let http: HttpTestingController;

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
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api/v1/' },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const text = (node: Element | null) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

  const render = async (areas = [buildAdminArea()]) => {
    const fixture = TestBed.createComponent(AreaCatalogComponent);
    await fixture.whenStable();
    http.expectOne(URL).flush(areas);
    const element = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await settle();
    const button = (label: string) =>
      element.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
    const rows = () => Array.from(element.querySelectorAll('tbody tr'));
    return { fixture, element, settle, button, rows };
  };

  const type = (element: HTMLElement, selector: string, value: string) => {
    const input = element.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  it('lista cada carrera con su código, sus conteos y su estado', async () => {
    const { element, rows } = await render([
      buildAdminArea(),
      buildAdminArea({ code: 'medicina', name: 'Medicina', is_active: false, manuscripts: 0, reviewers: 0 }),
    ]);

    expect(rows().map((row) => Array.from(row.querySelectorAll('td'), (c) => text(c)).slice(0, 5))).toEqual([
      ['Derecho', 'derecho', '2', '3', 'Activa'],
      ['Medicina', 'medicina', '0', '0', 'Inactiva'],
    ]);
    expect(text(element.querySelector('.list-header__count'))).toBe('2 carreras');
  });

  it('sin carreras muestra el estado vacío', async () => {
    const { element } = await render([]);

    expect(text(element.querySelector('app-empty-state'))).toContain('Todavía no hay carreras');
  });

  it('un error de carga ofrece reintentar', async () => {
    const fixture = TestBed.createComponent(AreaCatalogComponent);
    await fixture.whenStable();
    http.expectOne(URL).flush(errorEnvelope('SERVER_ERROR', 'Error.'), {
      status: 500,
      statusText: 'Server Error',
    });
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    element.querySelector<HTMLButtonElement>('app-error-state button')!.click();
    http.expectOne(URL).flush([buildAdminArea()]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  describe('alta', () => {
    it('crea la carrera, limpia el campo y la deja ordenada por nombre', async () => {
      const { element, settle, rows } = await render([buildAdminArea({ code: 'medicina', name: 'Medicina' })]);

      type(element, '#new-area-name', '  Biología ');
      await settle();
      element.querySelector<HTMLButtonElement>('form button[type="submit"]')!.click();
      await settle();

      const request = http.expectOne(URL);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ name: 'Biología' });
      request.flush(buildAdminArea({ code: 'biologia', name: 'Biología', manuscripts: 0, reviewers: 0 }), {
        status: 201,
        statusText: 'Created',
      });
      await settle();

      expect(rows().map((r) => text(r.querySelector('td')))).toEqual(['Biología', 'Medicina']);
      expect(text(element.querySelector('.callout--success'))).toBe('Carrera «Biología» creada.');
      expect((element.querySelector('#new-area-name') as HTMLInputElement).value).toBe('');
    });

    it('un nombre vacío no envía nada y se anuncia con role="alert"', async () => {
      const { element, settle } = await render();

      element.querySelector<HTMLButtonElement>('form button[type="submit"]')!.click();
      await settle();

      http.expectNone(URL);
      expect(text(element.querySelector('[role="alert"]'))).toBe('Indique el nombre de la carrera.');
    });

    it('el rechazo del servidor (nombre repetido) se muestra y no agrega la fila', async () => {
      const { element, settle, rows } = await render();
      type(element, '#new-area-name', 'derecho');
      await settle();
      element.querySelector<HTMLButtonElement>('form button[type="submit"]')!.click();
      await settle();

      http.expectOne(URL).flush(errorEnvelope('VALIDATION_ERROR', 'Ya existe una carrera con ese nombre.'), {
        status: 400,
        statusText: 'Bad Request',
      });
      await settle();

      expect(rows()).toHaveLength(1);
      expect(element.querySelector('[role="alert"]')).not.toBeNull();
    });
  });

  describe('renombrar', () => {
    it('envía solo el nombre; el código no cambia', async () => {
      const { element, settle, button, rows } = await render();

      button('Renombrar Derecho').click();
      await settle();
      type(element, '#name-derecho', 'Derecho y Ciencias Políticas');
      await settle();
      Array.from(element.querySelectorAll('button')).find((b) => text(b) === 'Guardar')!.click();
      await settle();

      const request = http.expectOne(`${URL}derecho/`);
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({ name: 'Derecho y Ciencias Políticas' });
      request.flush(buildAdminArea({ name: 'Derecho y Ciencias Políticas' }));
      await settle();

      const cellsOfRow = Array.from(rows()[0].querySelectorAll('td'), (c) => text(c));
      expect(cellsOfRow.slice(0, 2)).toEqual(['Derecho y Ciencias Políticas', 'derecho']);
      expect(text(element.querySelector('.callout--success'))).toContain('renombrada');
    });

    it('sin cambios o con Cancelar no envía nada', async () => {
      const { element, settle, button } = await render();

      button('Renombrar Derecho').click();
      await settle();
      Array.from(element.querySelectorAll('button')).find((b) => text(b) === 'Guardar')!.click();
      await settle();
      button('Renombrar Derecho').click();
      await settle();
      Array.from(element.querySelectorAll('button')).find((b) => text(b) === 'Cancelar')!.click();
      await settle();

      http.expectNone(`${URL}derecho/`);
      expect(element.querySelector('#name-derecho')).toBeNull();
    });
  });

  describe('jerarquía de acciones', () => {
    const tones = (node: Element) =>
      Array.from(node.classList)
        .filter((name) => name.startsWith('btn--'))
        .sort();

    it('las acciones de cada fila son compactas y desactivar va en tono de peligro', async () => {
      const { button } = await render([
        buildAdminArea(),
        buildAdminArea({ code: 'medicina', name: 'Medicina', is_active: false }),
      ]);

      expect(tones(button('Renombrar Derecho'))).toEqual(['btn--subtle']);
      expect(tones(button('Desactivar Derecho'))).toEqual(['btn--danger-text', 'btn--subtle']);
      expect(tones(button('Activar Medicina'))).toEqual(['btn--subtle']);
    });

    it('al renombrar, «Guardar» tiene borde y la única destacada es «Crear carrera»', async () => {
      const { element, settle, button } = await render();

      button('Renombrar Derecho').click();
      await settle();

      const save = Array.from(element.querySelectorAll('button')).find((b) => text(b) === 'Guardar')!;
      expect(tones(save)).toEqual(['btn--ghost']);
      expect(
        Array.from(element.querySelectorAll('section > form .btn--primary, table .btn--primary'), text),
      ).toEqual(['Crear carrera']);
    });
  });

  describe('activar y desactivar', () => {
    const dialog = (element: HTMLElement) =>
      element.querySelector('app-confirm-dialog dialog') as HTMLDialogElement;

    it('desactivar pide confirmación que explica qué se conserva y no actúa hasta confirmar', async () => {
      const { element, settle, button } = await render();

      button('Desactivar Derecho').click();
      await settle();

      expect(dialog(element).hasAttribute('open')).toBe(true);
      expect(text(dialog(element))).toContain('se conservan');
      http.expectNone(`${URL}derecho/`);

      Array.from(dialog(element).querySelectorAll('button'))
        .find((b) => text(b) === 'Desactivar')!
        .click();
      await settle();

      const request = http.expectOne(`${URL}derecho/`);
      expect(request.request.body).toEqual({ is_active: false });
      request.flush(buildAdminArea({ is_active: false }));
      await settle();

      expect(text(element.querySelector('tbody .badge'))).toBe('Inactiva');
      expect(text(element.querySelector('.callout--success'))).toBe('Carrera «Derecho» desactivada.');
    });

    it('activar una inactiva envía is_active verdadero', async () => {
      const { element, settle, button } = await render([buildAdminArea({ is_active: false })]);

      button('Activar Derecho').click();
      await settle();
      Array.from(dialog(element).querySelectorAll('button'))
        .find((b) => text(b) === 'Activar')!
        .click();
      await settle();

      const request = http.expectOne(`${URL}derecho/`);
      expect(request.request.body).toEqual({ is_active: true });
      request.flush(buildAdminArea());
      await settle();

      expect(text(element.querySelector('tbody .badge'))).toBe('Activa');
    });

    it('cancelar la confirmación no envía nada', async () => {
      const { element, settle, button } = await render();

      button('Desactivar Derecho').click();
      await settle();
      Array.from(dialog(element).querySelectorAll('button'))
        .find((b) => text(b) === 'Cancelar')!
        .click();
      await settle();

      http.expectNone(`${URL}derecho/`);
      expect(dialog(element).hasAttribute('open')).toBe(false);
    });
  });
});
