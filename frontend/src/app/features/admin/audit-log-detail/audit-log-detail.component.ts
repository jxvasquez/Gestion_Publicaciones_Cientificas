import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, map, of, switchMap, tap } from 'rxjs';

import { newIdempotencyKey } from '../../../core/http/idempotency-key';
import { ApiError, toApiError } from '../../../core/models/api-error.model';
import {
  AuditEventDetail,
  DECISION_LABELS,
  actionLabel,
  actorRoleLabel,
  detailLabel,
  detailValue,
  resultLabel,
} from '../../../core/models/audit.model';
import { AdminService } from '../../../core/services/admin.service';
import { AuditService } from '../../../core/services/audit.service';
import { ErrorStateComponent } from '../../../shared/components/error-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner.component';
import {
  CorrectionChoice,
  VerdictCorrectionDialogComponent,
} from '../verdict-correction-dialog/verdict-correction-dialog.component';

/** Las fechas se muestran en la zona institucional (UTC-5, sin horario de verano). */
const INSTITUTIONAL_OFFSET = '-0500';

/**
 * Detalle de un evento de auditoría (plan sección 3.5, HU-17).
 *
 * Muestra solo lo que el backend minimiza para el Administrador: ids
 * opacos, rol, acción, entidad, resultado, fecha, los dos hashes de la
 * cadena y los campos de `details` de la lista blanca. Nunca hay contenido
 * del manuscrito, comentarios, texto libre, IP ni agente de usuario.
 *
 * «Habilitar corrección» aparece solo si el backend lo autoriza
 * (`can_authorize_correction`, que llega únicamente en eventos de
 * veredicto): la SPA no lo deduce del tipo de evento ni del rol. Al
 * confirmarla desaparece, porque el backend ya no la ofrecería.
 */
@Component({
  selector: 'app-audit-log-detail',
  imports: [
    DatePipe,
    RouterLink,
    LoadingSpinnerComponent,
    ErrorStateComponent,
    VerdictCorrectionDialogComponent,
  ],
  templateUrl: './audit-log-detail.component.html',
  styleUrl: './audit-log-detail.component.scss',
})
export class AuditLogDetailComponent {
  private readonly service = inject(AuditService);
  private readonly admin = inject(AdminService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly offset = INSTITUTIONAL_OFFSET;

  protected readonly viewState = signal<'loading' | 'ready' | 'missing' | 'error'>('loading');
  protected readonly event = signal<AuditEventDetail | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly correctionOpen = signal(false);
  protected readonly correctionBusy = signal(false);
  /** Error que se muestra dentro del diálogo (el servidor rechazó el motivo o falló la red). */
  protected readonly correctionError = signal('');
  /** Aviso fuera del diálogo: la corrección ya no se puede habilitar sobre este veredicto. */
  protected readonly correctionNotice = signal('');
  protected readonly correctionDone = signal(false);

  /** Identifica esta intención; un reintento con el mismo motivo repite la clave. */
  private correctionAttempt: { signature: string; key: string } | null = null;

  private readonly retry$ = new BehaviorSubject<void>(undefined);

  constructor() {
    combineLatest([this.route.paramMap, this.retry$])
      .pipe(
        map(([params]) => params.get('id') ?? ''),
        tap(() => {
          this.viewState.set('loading');
          this.resetCorrection();
        }),
        switchMap((id) =>
          this.service.get(id).pipe(
            map((data) => ({ data, error: null as ApiError | null })),
            catchError((error: unknown) => of({ data: null, error: toApiError(error) })),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ data, error }) => {
        this.event.set(data);
        this.error.set(error);
        this.viewState.set(error ? (error.status === 404 ? 'missing' : 'error') : 'ready');
      });
  }

  protected action(): string {
    return actionLabel(this.event()?.action ?? '');
  }

  protected result(): string {
    return resultLabel(this.event()?.result ?? '');
  }

  protected role(): string {
    const role = this.event()?.actor_role;
    return actorRoleLabel(role ?? null);
  }

  /** Campos de `details` que se muestran; el manuscrito ya tiene su fila propia. */
  protected detailKeys(): string[] {
    return Object.keys(this.event()?.details ?? {}).filter((key) => key !== 'manuscript_id');
  }

  protected label(key: string): string {
    return detailLabel(key);
  }

  protected value(key: string): string {
    return detailValue(this.event()?.details[key] ?? null);
  }

  protected decision(code: string): string {
    return DECISION_LABELS[code] ?? code;
  }

  protected requestCorrection(): void {
    this.correctionError.set('');
    this.correctionOpen.set(true);
  }

  protected closeCorrection(): void {
    this.correctionOpen.set(false);
    this.correctionError.set('');
  }

  protected correct(choice: CorrectionChoice): void {
    const verdict = this.event()?.verdict;
    if (!verdict || this.correctionBusy()) {
      return;
    }
    const signature = JSON.stringify(choice);
    if (this.correctionAttempt?.signature !== signature) {
      this.correctionAttempt = { signature, key: newIdempotencyKey() };
    }
    this.correctionBusy.set(true);
    this.correctionError.set('');
    this.admin.correctVerdict(verdict.id, choice, this.correctionAttempt.key).subscribe({
      next: () => {
        this.correctionBusy.set(false);
        this.correctionOpen.set(false);
        this.correctionAttempt = null;
        this.correctionDone.set(true);
        this.hideCorrection();
      },
      error: (error: ApiError) => {
        this.correctionBusy.set(false);
        if (error.status === 409 || error.status === 404) {
          // El veredicto dejó de ser corregible: la acción ya no se ofrece.
          this.correctionOpen.set(false);
          this.correctionAttempt = null;
          this.correctionNotice.set(error.message);
          this.hideCorrection();
          return;
        }
        this.correctionError.set(error.userMessage);
      },
    });
  }

  /** El backend ya no la aceptaría: se retira la acción sin releer el evento. */
  private hideCorrection(): void {
    this.event.update((current) =>
      current ? { ...current, can_authorize_correction: false } : current,
    );
  }

  private resetCorrection(): void {
    this.correctionOpen.set(false);
    this.correctionBusy.set(false);
    this.correctionError.set('');
    this.correctionNotice.set('');
    this.correctionDone.set(false);
    this.correctionAttempt = null;
  }

  protected reload(): void {
    this.retry$.next();
  }
}
