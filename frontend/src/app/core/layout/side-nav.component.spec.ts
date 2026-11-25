import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Role } from '../models/role.model';
import { SideNavComponent } from './side-nav.component';

const render = async (roles: Role[]) => {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(SideNavComponent);
  fixture.componentRef.setInput('roles', roles);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
};

const links = (element: HTMLElement) =>
  Array.from(element.querySelectorAll('a'), (a) => [a.textContent?.trim(), a.getAttribute('href')]);

describe('SideNavComponent', () => {
  it('el Administrador ve Incidentes, Revisores, Carreras y Auditoría, y ningún grupo del Editor', async () => {
    const element = await render(['ADMIN']);

    expect(links(element).slice(2)).toEqual([
      ['Incidentes', '/app/admin/incidents'],
      ['Revisores', '/app/admin/reviewers'],
      ['Carreras', '/app/admin/areas'],
      ['Auditoría', '/app/admin/audit'],
    ]);
    expect(element.textContent).not.toContain('Editor');
    expect(element.innerHTML).not.toContain('/app/editor');
  });

  it('un Autor y un Revisor ven solo sus módulos', async () => {
    const element = await render(['AUTHOR', 'REVIEWER']);

    expect(links(element).map(([label]) => label)).toEqual([
      'Panel',
      'Notificaciones',
      'Mis manuscritos',
      'Mis asignaciones',
      'Historial de evaluaciones',
    ]);
  });

  it('cada enlace usa un icono que existe en el sprite, incluido «areas»', async () => {
    const element = await render(['ADMIN']);

    const uses = Array.from(element.querySelectorAll('use'), (u) => u.getAttribute('href'));
    expect(uses).toContain('icons/ui.svg#areas');
    expect(uses.every((href) => href?.startsWith('icons/ui.svg#'))).toBe(true);
  });
});
