import { TestBed } from '@angular/core/testing';

import { ThemeService } from '../theme/theme.service';
import { ThemeToggleComponent } from './theme-toggle.component';

describe('ThemeToggleComponent', () => {
  const root = document.documentElement;

  afterEach(() => {
    root.removeAttribute('data-theme');
    document.defaultView?.localStorage?.removeItem('gpc-theme');
  });

  const render = async (theme: 'light' | 'dark') => {
    root.setAttribute('data-theme', theme);
    const fixture = TestBed.createComponent(ThemeToggleComponent);
    await fixture.whenStable();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    return { fixture, button };
  };

  const icon = (button: HTMLButtonElement) => button.querySelector('use')?.getAttribute('href');

  it('es un botón compacto con borde y nombre accesible constante', async () => {
    const { button } = await render('light');

    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Tema oscuro');
    expect(button.classList).toContain('btn--ghost');
    expect(button.classList).toContain('btn--icon');
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it.each([
    ['light', 'false', 'icons/ui.svg#moon'],
    ['dark', 'true', 'icons/ui.svg#sun'],
  ] as const)('en tema %s: aria-pressed=%s e icono %s', async (theme, pressed, href) => {
    const { button } = await render(theme);

    expect(button.getAttribute('aria-pressed')).toBe(pressed);
    expect(icon(button)).toBe(href);
  });

  it('al pulsarlo alterna el tema y actualiza su estado sin cambiar de nombre', async () => {
    const { fixture, button } = await render('light');

    button.click();
    await fixture.whenStable();

    expect(TestBed.inject(ThemeService).theme()).toBe('dark');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Tema oscuro');
    expect(icon(button)).toBe('icons/ui.svg#sun');
  });
});
