import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AuditFilters } from '../../../core/models/audit.model';
import { ACTOR_ID, MANUSCRIPT_ID } from '../testing/audit.fixtures';
import { AuditFiltersComponent } from './audit-filters.component';

@Component({
  imports: [AuditFiltersComponent],
  template: `<app-audit-filters
    [filters]="current"
    (searched)="searched = $event"
    (cleared)="cleared = cleared + 1"
  />`,
})
class HostComponent {
  current: AuditFilters = {};
  searched: AuditFilters | null = null;
  cleared = 0;
}

describe('AuditFiltersComponent', () => {
  const setup = async (current: AuditFilters = {}) => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.current = current;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const field = (id: string) => root.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!;
    const type = (id: string, value: string) => {
      const control = field(id);
      control.value = value;
      control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input'));
    };
    const submit = () => {
      root.querySelector('form')!.dispatchEvent(new Event('submit'));
      fixture.detectChanges();
    };
    return { fixture, host: fixture.componentInstance, root, field, type, submit };
  };

  it('ofrece fecha, actor, acción, manuscrito y resultado', async () => {
    const { root } = await setup();

    for (const label of ['Desde', 'Hasta', 'Acción', 'Resultado', 'Actor (id)', 'Manuscrito (id)']) {
      expect(root.textContent, label).toContain(label);
    }
  });

  it('refleja los filtros vigentes de la URL', async () => {
    const { field } = await setup({
      date_from: '2026-10-01',
      action: 'LOGIN',
      result: 'DENIED',
      actor: ACTOR_ID,
    });

    expect(field('audit-from').value).toBe('2026-10-01');
    expect(field('audit-action').value).toBe('LOGIN');
    expect(field('audit-result').value).toBe('DENIED');
    expect(field('audit-actor').value).toBe(ACTOR_ID);
  });

  it('emite solo los campos con valor', async () => {
    const { host, type, submit } = await setup();

    type('audit-action', 'VERDICT_REGISTERED');
    type('audit-result', 'SUCCESS');
    submit();

    expect(host.searched).toEqual({ action: 'VERDICT_REGISTERED', result: 'SUCCESS' });
  });

  it('emite los ids en minúsculas y sin espacios', async () => {
    const { host, type, submit } = await setup();

    type('audit-manuscript', `  ${MANUSCRIPT_ID.toUpperCase()} `);
    submit();

    expect(host.searched).toEqual({ manuscript: MANUSCRIPT_ID });
  });

  it('no emite si «desde» es posterior a «hasta» y lo explica', async () => {
    const { host, root, type, submit } = await setup();

    type('audit-from', '2026-10-31');
    type('audit-to', '2026-10-01');
    submit();

    expect(host.searched).toBeNull();
    expect(root.querySelector('[role="alert"]')!.textContent).toContain('no puede ser posterior');
  });

  it('no emite un actor que no es un identificador', async () => {
    const { host, root, type, submit } = await setup();

    type('audit-actor', 'jperez');
    submit();

    expect(host.searched).toBeNull();
    expect(root.textContent).toContain('El actor debe ser un identificador válido');
  });

  it('no emite una acción con formato inválido', async () => {
    const { host, root, type, submit } = await setup();

    type('audit-action', 'login ahora');
    submit();

    expect(host.searched).toBeNull();
    expect(root.textContent).toContain('La acción solo admite mayúsculas');
  });

  it('«Limpiar» avisa al contenedor', async () => {
    const { host, root, fixture } = await setup({ result: 'DENIED' });

    root.querySelector<HTMLButtonElement>('button[type="button"]')!.click();
    fixture.detectChanges();

    expect(host.cleared).toBe(1);
  });

  describe('panel «Filtros»', () => {
    const panel = (root: HTMLElement) =>
      root.querySelector<HTMLDetailsElement>('details.disclosure')!;
    const count = (root: HTMLElement) =>
      panel(root).querySelector('summary .disclosure__count')?.textContent?.trim();

    it('contiene el formulario, plegado y sin conteo cuando no hay filtros', async () => {
      const { root } = await setup();

      expect(panel(root).querySelector('summary')?.textContent?.trim()).toBe('Filtros');
      expect(panel(root).querySelector('form')).not.toBeNull();
      expect(panel(root).open).toBe(false);
      expect(count(root)).toBeUndefined();
    });

    it('con filtros activos se abre y dice cuántos son', async () => {
      const { root } = await setup({ action: 'LOGIN', result: 'DENIED', actor: ACTOR_ID });

      expect(panel(root).open).toBe(true);
      expect(count(root)).toBe('3');
    });

    it.each([
      ['audit-actor', 'jperez'],
      ['audit-manuscript', 'uno'],
      ['audit-action', 'login ahora'],
    ])('se abre con un error en %s', async (id, value) => {
      const { root, fixture, type, submit } = await setup();

      type(id, value);
      submit();
      await fixture.whenStable();

      expect(panel(root).open).toBe(true);
    });

    it('«Filtrar» sigue siendo la acción destacada y «Limpiar» es compacta', async () => {
      const { root } = await setup();

      expect(root.querySelector('button[type="submit"]')!.classList).toContain('btn--primary');
      expect(root.querySelector('button[type="button"]')!.classList).toContain('btn--subtle');
    });
  });
});
