import { DOCUMENT, DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

/** Clave de `localStorage`. La repite `public/theme-init.js`, que corre antes de Angular. */
export const THEME_STORAGE_KEY = 'gpc-theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

/** La elección guardada manda; sin ella (o si no es válida) decide el sistema operativo. */
export function resolveTheme(stored: unknown, prefersDark: boolean): Theme {
  if (isTheme(stored)) {
    return stored;
  }
  return prefersDark ? 'dark' : 'light';
}

/**
 * Única fuente del tema dentro de la SPA (spec 005, FR-006).
 *
 * Parte del atributo `data-theme` que fijó `theme-init.js`, guarda la elección de la
 * persona, sigue al sistema operativo mientras no haya una, adopta la de otras pestañas
 * y tolera un almacenamiento no disponible: el tema cambia igual en la pestaña.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly view = this.document.defaultView;
  private readonly systemDark =
    typeof this.view?.matchMedia === 'function' ? this.view.matchMedia(DARK_QUERY) : null;

  /** La persona eligió un tema: los cambios del sistema operativo dejan de aplicarse. */
  private explicit: boolean;
  private readonly current = signal<Theme>('light');

  readonly theme = this.current.asReadonly();
  readonly isDark = computed(() => this.current() === 'dark');

  constructor() {
    const stored = this.read();
    const booted = this.document.documentElement.getAttribute('data-theme');
    this.explicit = isTheme(stored);
    this.current.set(
      isTheme(booted) ? booted : resolveTheme(stored, this.systemDark?.matches ?? false),
    );
    this.document.documentElement.setAttribute('data-theme', this.current());
    this.listen();
  }

  toggle(): void {
    this.set(this.isDark() ? 'light' : 'dark');
  }

  /** Elección de la persona: se aplica y se recuerda en este navegador. */
  set(theme: Theme): void {
    this.explicit = true;
    this.apply(theme);
    try {
      this.view?.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Almacenamiento bloqueado o lleno: la elección dura lo que la pestaña.
    }
  }

  private read(): string | null {
    try {
      return this.view?.localStorage.getItem(THEME_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  private apply(theme: Theme): void {
    if (theme === this.current()) {
      return;
    }
    const root = this.document.documentElement;
    // Sin transiciones mientras cambian los colores: se fuerza el recálculo de estilos
    // antes de reactivarlas, así el cambio de tema no se anima.
    root.setAttribute('data-theme-switching', '');
    root.setAttribute('data-theme', theme);
    void root.offsetWidth;
    root.removeAttribute('data-theme-switching');
    this.current.set(theme);
  }

  private listen(): void {
    const onSystemChange = (event: { matches: boolean }) => {
      if (!this.explicit) {
        this.apply(resolveTheme(null, event.matches));
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) {
        return;
      }
      this.explicit = isTheme(event.newValue);
      this.apply(resolveTheme(event.newValue, this.systemDark?.matches ?? false));
    };

    this.systemDark?.addEventListener?.('change', onSystemChange);
    this.view?.addEventListener('storage', onStorage);
    inject(DestroyRef).onDestroy(() => {
      this.systemDark?.removeEventListener?.('change', onSystemChange);
      this.view?.removeEventListener('storage', onStorage);
    });
  }
}
