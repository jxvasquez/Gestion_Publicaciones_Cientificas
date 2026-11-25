import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { API_BASE_URL } from '../../../core/http/api-base-url.token';
import { DashboardResponse } from '../../../core/models/dashboard.model';
import { Role } from '../../../core/models/role.model';
import { UnifiedDashboardComponent } from './unified-dashboard.component';
import { errorEnvelope } from '../../../core/testing/api-envelope.fixtures';

const USER = {
  id: 'uuid-1',
  institutional_id: 'INST-0001',
  username: 'a.lopez',
  email: 'a.lopez@unl.edu.ec',
  first_name: 'Ana',
  last_name: 'López',
  full_name: 'Ana López',
};

const dashboardOf = (
  roles: Role[],
  sections: DashboardResponse['sections'],
): DashboardResponse => ({ user: USER, roles, sections });

const ok = (data: Record<string, unknown> = {}) => ({
  status: 'ok' as const,
  data,
  message: null,
});

const failed = (message: string) => ({
  status: 'error' as const,
  data: null,
  message,
});

describe('UnifiedDashboardComponent', () => {
  let httpMock: HttpTestingController;

  const render = async () => {
    const fixture = TestBed.createComponent(UnifiedDashboardComponent);
    await fixture.whenStable();
    return fixture;
  };

  const flush = (response: DashboardResponse) =>
    httpMock.expectOne({ method: 'GET', url: '/api/v1/dashboard/' }).flush(response);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE_URL, useValue: '/api/v1/' },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('consume el panel UNA sola vez y renderiza las secciones de todos los roles activos simultáneamente', async () => {
    const fixture = TestBed.createComponent(UnifiedDashboardComponent);
    await fixture.whenStable();

    flush(
      dashboardOf(['AUTHOR', 'REVIEWER', 'ADMIN'], {
        author: ok({ manuscripts: 3 }),
        reviewer: ok({ ranking_score: 0 }),
        admin: ok({ open_incidents: 42 }),
      }),
    );
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('app-author-summary')).not.toBeNull();
    expect(element.querySelector('app-reviewer-summary')).not.toBeNull();
    expect(element.querySelector('app-admin-summary')).not.toBeNull();
    expect(element.querySelector('app-author-summary dd')?.textContent?.trim()).toBe('3');
    expect(element.querySelector('app-reviewer-summary dd')?.textContent?.trim()).toBe('0');
    expect(element.querySelector('app-admin-summary dd')?.textContent?.trim()).toBe('42');
    // Una sola petición al backend por carga.
    httpMock.verify();
  });

  it('el nombre de cada rol aparece una sola vez en su tarjeta, no duplicado', async () => {
    const fixture = await render();
    flush(
      dashboardOf(['AUTHOR', 'REVIEWER', 'ADMIN'], {
        author: ok({ manuscripts: 3 }),
        reviewer: ok({ ranking_score: 1 }),
        admin: ok({ open_incidents: 42 }),
      }),
    );
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const names = { author: 'Autor', reviewer: 'Revisor', admin: 'Administrador' };
    for (const [key, name] of Object.entries(names)) {
      const card = element.querySelector(`[data-section="${key}"]`) as HTMLElement;
      const headings = Array.from(card.querySelectorAll('h1, h2, h3, h4')).map((h) =>
        h.textContent?.trim(),
      );
      expect(headings, `tarjeta ${key}`).toEqual([name]);
    }
  });

  it('una sección fallida conserva el nombre del rol, porque no hay tarjeta resumen que lo muestre', async () => {
    const fixture = await render();
    flush(
      dashboardOf(['AUTHOR', 'ADMIN'], {
        author: ok({ manuscripts: 5 }),
        admin: failed('No se pudo cargar esta sección. Intente de nuevo.'),
      }),
    );
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const card = element.querySelector('[data-section="admin"]') as HTMLElement;
    expect(Array.from(card.querySelectorAll('h1, h2, h3, h4')).map((h) => h.textContent?.trim())).toEqual(
      ['Administrador'],
    );
    expect(card.querySelector('app-error-state')).not.toBeNull();
  });

  it('un solo rol ve únicamente su sección, sin apartados vacíos de roles inexistentes', async () => {
    const fixture = await render();
    flush(
      dashboardOf(['REVIEWER'], {
        reviewer: ok({ pending: 2 }),
      }),
    );
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('app-reviewer-summary')).not.toBeNull();
    expect(element.querySelector('app-author-summary')).toBeNull();
    expect(element.querySelector('app-admin-summary')).toBeNull();
    expect(element.querySelector('app-admin-summary')).toBeNull();
    expect(Array.from(element.querySelectorAll('a'), (link) => link.getAttribute('href'))).toEqual([
      '/app/reviewer/assignments',
      '/app/reviewer/history',
    ]);
  });

  it('el fallo de una sección no oculta las demás y ofrece Reintentar', async () => {
    const fixture = await render();
    flush(
      dashboardOf(['AUTHOR', 'ADMIN'], {
        author: ok({ manuscripts: 5 }),
        admin: failed('No se pudo cargar esta sección. Intente de nuevo.'),
      }),
    );
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    // La sección sana sigue visible con sus datos.
    expect(element.querySelector('app-author-summary')).not.toBeNull();
    // La fallida muestra el aviso reintentable del backend.
    const adminSection = element.querySelector('[data-section="admin"]');
    expect(adminSection?.querySelector('app-error-state')).not.toBeNull();
    expect(adminSection?.textContent).toContain('Intente de nuevo');
    const retryButton = adminSection?.querySelector<HTMLButtonElement>('button');
    expect(retryButton?.textContent).toContain('Reintentar');

    // Reintentar: vuelve a llamar al panel una única vez y restaura.
    retryButton?.click();
    await fixture.whenStable();
    flush(
      dashboardOf(['AUTHOR', 'ADMIN'], {
        author: ok({ manuscripts: 5 }),
        admin: ok({ open_incidents: 1 }),
      }),
    );
    await fixture.whenStable();

    const restored = fixture.nativeElement as HTMLElement;
    const adminAfter = restored.querySelector('[data-section="admin"]');
    expect(adminAfter?.querySelector('app-admin-summary')).not.toBeNull();
    expect(adminAfter?.querySelector('app-error-state')).toBeNull();
    httpMock.verify();
  });

  it('una cuenta sin roles activos ve el mensaje explícito', async () => {
    const fixture = await render();
    flush(dashboardOf([], {}));
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Sin roles habilitados');
    expect(element.querySelector('app-author-summary')).toBeNull();
  });

  it('un fallo global del panel muestra error con Reintentar', async () => {
    const fixture = await render();
    httpMock
      .expectOne('/api/v1/dashboard/')
      .flush(errorEnvelope('SERVER_ERROR', 'Error interno.'), {
        status: 500,
        statusText: 'Server Error',
      });
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('app-error-state')).not.toBeNull();
    expect(element.textContent).toContain('Error interno');

    element.querySelector<HTMLButtonElement>('app-error-state button')?.click();
    await fixture.whenStable();
    flush(dashboardOf(['AUTHOR'], { author: ok({ manuscripts: 1 }) }));
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('app-author-summary')).not.toBeNull();
  });

  it('no existe paso de selección de rol ni selector en el panel', async () => {
    const fixture = await render();
    flush(
      dashboardOf(['AUTHOR', 'ADMIN'], {
        author: ok(),
      }),
    );
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('select')).toBeNull();
    expect(element.textContent).not.toContain('Seleccione rol');
    // No pide el panel por sección: una única llamada HTTP en total.
    httpMock.verify();
  });
});
