import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { THEME_STORAGE_KEY, ThemeService, resolveTheme } from './theme.service';

describe('ThemeService', () => {
  const view = document.defaultView!;
  const root = document.documentElement;
  const originals = {
    localStorage: Object.getOwnPropertyDescriptor(view, 'localStorage'),
    matchMedia: Object.getOwnPropertyDescriptor(view, 'matchMedia'),
  };

  let stored: Map<string, string>;
  let setItem: ReturnType<typeof vi.fn>;
  let prefersDark: boolean;
  let mediaListeners: Set<(event: { matches: boolean }) => void>;

  const define = (name: 'localStorage' | 'matchMedia', value: unknown) =>
    Object.defineProperty(view, name, { configurable: true, writable: true, value });

  const restore = (name: 'localStorage' | 'matchMedia') => {
    const original = originals[name];
    if (original) {
      Object.defineProperty(view, name, original);
    } else {
      delete (view as unknown as Record<string, unknown>)[name];
    }
  };

  /** Simula el cambio de la preferencia del sistema operativo. */
  const systemChanges = (dark: boolean) => {
    prefersDark = dark;
    mediaListeners.forEach((listener) => listener({ matches: dark }));
  };

  /** Simula el evento que recibe una pestaña cuando otra escribe en `localStorage`. */
  const otherTab = (key: string, newValue: string | null) =>
    view.dispatchEvent(Object.assign(new view.Event('storage'), { key, newValue }));

  const create = () => TestBed.inject(ThemeService);

  beforeEach(() => {
    root.removeAttribute('data-theme');
    stored = new Map();
    prefersDark = false;
    mediaListeners = new Set();
    setItem = vi.fn((key: string, value: string) => void stored.set(key, value));
    define('localStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem });
    define('matchMedia', (query: string) => ({
      get matches() {
        return query === '(prefers-color-scheme: dark)' && prefersDark;
      },
      addEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
        mediaListeners.add(listener),
      removeEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
        mediaListeners.delete(listener),
    }));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    restore('localStorage');
    restore('matchMedia');
    root.removeAttribute('data-theme');
    vi.restoreAllMocks();
  });

  it.each([
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    [null, true, 'dark'],
    [null, false, 'light'],
    ['azul', true, 'dark'],
    ['', false, 'light'],
  ] as const)('resolveTheme(%j, %j) es «%s»', (value, dark, expected) => {
    expect(resolveTheme(value, dark)).toBe(expected);
  });

  it('parte del atributo que fijó el script de arranque', () => {
    root.setAttribute('data-theme', 'dark');

    const service = create();

    expect(service.theme()).toBe('dark');
    expect(service.isDark()).toBe(true);
  });

  it.each([
    ['dark', false, 'dark'],
    ['light', true, 'light'],
    ['otro', true, 'dark'],
    [null, true, 'dark'],
    [null, false, 'light'],
  ] as const)(
    'sin atributo, con %j guardado y sistema oscuro=%j, aplica «%s»',
    (value, dark, expected) => {
      if (value !== null) {
        stored.set(THEME_STORAGE_KEY, value);
      }
      prefersDark = dark;

      expect(create().theme()).toBe(expected);
      expect(root.getAttribute('data-theme')).toBe(expected);
    },
  );

  it('arrancar no guarda nada: sin elección se sigue al sistema', () => {
    create();

    expect(setItem).not.toHaveBeenCalled();
  });

  it('toggle() cambia el atributo, guarda la elección y la hace explícita', () => {
    const service = create();

    service.toggle();

    expect(service.theme()).toBe('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(setItem).toHaveBeenCalledWith('gpc-theme', 'dark');
    systemChanges(false);
    expect(service.theme()).toBe('dark');

    service.toggle();
    expect(service.theme()).toBe('light');
    expect(stored.get(THEME_STORAGE_KEY)).toBe('light');
  });

  it('cambia sin animar los colores y no deja la marca puesta', () => {
    const service = create();
    const calls = vi.spyOn(root, 'setAttribute');

    service.toggle();

    expect(calls.mock.calls.map(([name]) => name)).toEqual(['data-theme-switching', 'data-theme']);
    expect(root.hasAttribute('data-theme-switching')).toBe(false);
  });

  it('si no se puede guardar, el tema cambia igual y sin errores', () => {
    setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const service = create();

    expect(() => service.toggle()).not.toThrow();
    expect(root.getAttribute('data-theme')).toBe('dark');
    systemChanges(false);
    expect(service.theme()).toBe('dark');
  });

  it('si el almacenamiento está bloqueado, usa la preferencia del sistema', () => {
    Object.defineProperty(view, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('SecurityError');
      },
    });
    prefersDark = true;

    const service = create();

    expect(service.theme()).toBe('dark');
    expect(() => service.toggle()).not.toThrow();
    expect(service.theme()).toBe('light');
  });

  it('sin elección explícita sigue los cambios del sistema', () => {
    const service = create();

    systemChanges(true);
    expect(service.theme()).toBe('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');

    systemChanges(false);
    expect(service.theme()).toBe('light');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('con una elección guardada ignora los cambios del sistema', () => {
    stored.set(THEME_STORAGE_KEY, 'light');
    const service = create();

    systemChanges(true);

    expect(service.theme()).toBe('light');
  });

  it('adopta el tema elegido en otra pestaña, sin volver a guardarlo', () => {
    const service = create();

    otherTab(THEME_STORAGE_KEY, 'dark');

    expect(service.theme()).toBe('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(setItem).not.toHaveBeenCalled();
    systemChanges(false);
    expect(service.theme()).toBe('dark');
  });

  it('si otra pestaña borra la preferencia, vuelve a seguir al sistema', () => {
    stored.set(THEME_STORAGE_KEY, 'dark');
    const service = create();

    otherTab(THEME_STORAGE_KEY, null);

    expect(service.theme()).toBe('light');
    systemChanges(true);
    expect(service.theme()).toBe('dark');
  });

  it('ignora el evento de otras claves', () => {
    const service = create();

    otherTab('otra-clave', 'dark');

    expect(service.theme()).toBe('light');
  });

  it('funciona en un entorno sin matchMedia', () => {
    define('matchMedia', undefined);

    const service = create();

    expect(service.theme()).toBe('light');
    expect(() => service.toggle()).not.toThrow();
  });

  it('al destruirse deja de escuchar los cambios', () => {
    create();
    expect(mediaListeners.size).toBe(1);

    TestBed.resetTestingModule();

    expect(mediaListeners.size).toBe(0);
  });
});
