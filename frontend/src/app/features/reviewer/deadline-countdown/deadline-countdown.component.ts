import { DatePipe } from '@angular/common';
import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';

/** Fechas y horas se muestran en la zona institucional (UTC-5, sin horario de verano). */
const INSTITUTIONAL_OFFSET = '-0500';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Con menos de un día el plazo se resalta como urgente. */
export const URGENT_THRESHOLD_MS = DAY;

/**
 * Tiempo restante en lenguaje corriente: «12 d 4 h», «3 h 05 min» o,
 * en la última hora, «42:07» (minutos y segundos). Nunca negativo.
 */
export function formatRemaining(ms: number): string {
  const remaining = Math.max(0, ms);
  if (remaining >= DAY) {
    const days = Math.floor(remaining / DAY);
    const hours = Math.floor((remaining % DAY) / HOUR);
    return `${days} d ${hours} h`;
  }
  if (remaining >= HOUR) {
    const hours = Math.floor(remaining / HOUR);
    const minutes = Math.floor((remaining % HOUR) / MINUTE);
    return `${hours} h ${String(minutes).padStart(2, '0')} min`;
  }
  const minutes = Math.floor(remaining / MINUTE);
  const seconds = Math.floor((remaining % MINUTE) / SECOND);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Fracción del plazo que queda, de 1 (recién asignada) a 0 (vencida). `null` si no hay
 * un plazo calculable: alguna fecha no es válida o la límite no es posterior.
 */
export function remainingFraction(assignedAt: string, dueAt: string, now: number): number | null {
  const start = Date.parse(assignedAt);
  const end = Date.parse(dueAt);
  // Con una fecha no válida la comparación también es falsa.
  if (!(end > start)) {
    return null;
  }
  return Math.min(1, Math.max(0, (end - now) / (end - start)));
}

/**
 * Contador del plazo de una asignación (plan sección 3.5, HU-14).
 *
 * * Cuenta contra `due_at`, la fecha exacta que fijó el backend. El reloj
 *   del navegador solo mueve el contador; `serverOffsetMs` (diferencia con
 *   el reloj del servidor) lo corrige para que un reloj desajustado no
 *   adelante ni atrase el vencimiento.
 * * `overdue` es el veredicto del servidor en la última lectura: si es
 *   verdadero el plazo está vencido aunque el reloj local diga lo contrario.
 * * Al vencer emite `expired` una vez por cuenta para que el contenedor
 *   deshabilite el envío. Es una ayuda de interfaz: el corte real lo aplica
 *   el servidor al recibir el envío.
 * * El contador no anuncia cada segundo a los lectores de pantalla; el
 *   vencimiento sí se anuncia (`role="status"`).
 * * Con `assignedAt` añade la fecha de asignación y un medidor del plazo restante
 *   (spec 005, FR-012), calculado con la misma hora del servidor.
 */
@Component({
  selector: 'app-deadline-countdown',
  imports: [DatePipe],
  templateUrl: './deadline-countdown.component.html',
  styleUrl: './deadline-countdown.component.scss',
})
export class DeadlineCountdownComponent {
  /** Fecha límite en ISO 8601, tal como la devuelve el backend. */
  readonly dueAt = input.required<string>();

  /** Fecha de asignación en ISO 8601; sin ella no hay medidor del plazo. */
  readonly assignedAt = input<string | null>(null);

  /** Diferencia `servidor − navegador` en milisegundos. */
  readonly serverOffsetMs = input(0);

  /** El servidor ya la dio por vencida en la última lectura. */
  readonly overdue = input(false);

  /** Se emite al vencer el plazo (también si ya estaba vencido al montar). */
  readonly expired = output<void>();

  protected readonly offset = INSTITUTIONAL_OFFSET;

  /** Hora del servidor estimada en el último tic. */
  private readonly serverNow = signal(Date.now());

  protected readonly remainingMs = computed(() => Date.parse(this.dueAt()) - this.serverNow());

  protected readonly isExpired = computed(() => this.overdue() || this.remainingMs() <= 0);

  protected readonly urgent = computed(
    () => !this.isExpired() && this.remainingMs() < URGENT_THRESHOLD_MS,
  );

  protected readonly label = computed(() => formatRemaining(this.remainingMs()));

  /** La fecha de asignación, solo si se puede mostrar. */
  protected readonly assigned = computed(() => {
    const value = this.assignedAt();
    return value !== null && !Number.isNaN(Date.parse(value)) ? value : null;
  });

  /** Porcentaje entero del plazo que queda; `null` si no se puede calcular. */
  protected readonly percent = computed(() => {
    const assigned = this.assigned();
    if (assigned === null) {
      return null;
    }
    const fraction = remainingFraction(assigned, this.dueAt(), this.serverNow());
    if (fraction === null) {
      return null;
    }
    return this.isExpired() ? 0 : Math.round(fraction * 100);
  });

  constructor() {
    effect((onCleanup) => {
      const offset = this.serverOffsetMs();
      const due = Date.parse(this.dueAt());
      const overdue = this.overdue();

      // Solo las entradas disparan el efecto: leer `serverNow` aquí lo
      // reiniciaría con cada tic.
      untracked(() => {
        const tick = () => {
          const now = Date.now() + offset;
          this.serverNow.set(now);
          return due - now;
        };

        if (tick() <= 0 || overdue) {
          this.expired.emit();
          return;
        }

        const timer = setInterval(() => {
          if (tick() <= 0) {
            clearInterval(timer);
            this.expired.emit();
          }
        }, SECOND);
        onCleanup(() => clearInterval(timer));
      });
    });
  }
}
