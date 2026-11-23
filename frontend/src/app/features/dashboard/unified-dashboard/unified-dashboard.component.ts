import { Component, OnInit, computed, inject, signal } from '@angular/core';

import { DashboardService } from '../../../core/services/dashboard.service';
import { ApiError } from '../../../core/models/api-error.model';
import {
  DASHBOARD_SECTION_KEYS,
  DASHBOARD_SECTION_LABELS,
  DashboardResponse,
  DashboardSection,
  DashboardSectionKey,
} from '../../../core/models/dashboard.model';
import { Role } from '../../../core/models/role.model';
import { EmptyStateComponent } from '../../../shared/components/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner.component';
import { AuthorSummaryComponent } from '../author-summary/author-summary.component';
import { ReviewerSummaryComponent } from '../reviewer-summary/reviewer-summary.component';
import { EditorSummaryComponent } from '../editor-summary/editor-summary.component';
import { AdminSummaryComponent } from '../admin-summary/admin-summary.component';

/**
 * Panel unificado multirrol (plan sección 3.4).
 *
 * Consume UNA sola vez `DashboardService.getDashboard()` y renderiza
 * las secciones de todos los roles activos a la vez; jamás pide al
 * usuario elegir un rol ni muestra un selector en el encabezado.
 *
 * Cada sección escribe en su propia señal y el fallo de una NO
 * cancela las demás: la sección fallida muestra el aviso reintentable
 * del backend con un botón "Reintentar" que vuelve a llamar al panel
 * conservando las demás visibles.
 */
@Component({
  selector: 'app-unified-dashboard',
  imports: [
    EmptyStateComponent,
    ErrorStateComponent,
    LoadingSpinnerComponent,
    AuthorSummaryComponent,
    ReviewerSummaryComponent,
    EditorSummaryComponent,
    AdminSummaryComponent,
  ],
  templateUrl: './unified-dashboard.component.html',
  styleUrl: './unified-dashboard.component.scss',
})
export class UnifiedDashboardComponent implements OnInit {
  private readonly service = inject(DashboardService);

  /** Señales por sección (plan sección 3.8). */
  readonly authorSection = signal<DashboardSection | null>(null);
  readonly reviewerSection = signal<DashboardSection | null>(null);
  readonly editorSection = signal<DashboardSection | null>(null);
  readonly adminSection = signal<DashboardSection | null>(null);

  readonly roles = signal<Role[]>([]);
  readonly loading = signal(true);
  readonly globalError = signal<ApiError | null>(null);

  /** Mensajes de las secciones fallidas; vacío cuando todas están bien. */
  readonly sectionErrors = computed(() =>
    DASHBOARD_SECTION_KEYS.filter((key) => this.section(key)?.status === 'error')
      .map((key) => this.section(key)?.message ?? key),
  );

  protected readonly hasNoRoles = computed(() => this.roles().length === 0);
  protected readonly sectionKeys = DASHBOARD_SECTION_KEYS;
  protected readonly sectionLabels = DASHBOARD_SECTION_LABELS;

  ngOnInit(): void {
    this.load();
  }

  /** Una sola llamada por carga: todas las secciones de una vez. */
  protected load(): void {
    this.loading.set(true);
    this.globalError.set(null);

    this.service.getDashboard().subscribe({
      next: (response: DashboardResponse) => {
        this.apply(response);
        this.loading.set(false);
      },
      error: (error: ApiError) => {
        this.globalError.set(error);
        this.loading.set(false);
      },
    });
  }

  /**
   * "Reintentar" de una sección fallida: vuelve a llamar al panel
   * (única fuente) conservando visibles las secciones sanas mientras
   * llega la respuesta nueva.
   */
  protected retrySection(_key: DashboardSectionKey): void {
    this.load();
  }

  protected section(key: DashboardSectionKey): DashboardSection | null {
    switch (key) {
      case 'author':
        return this.authorSection();
      case 'reviewer':
        return this.reviewerSection();
      case 'editor':
        return this.editorSection();
      case 'admin':
        return this.adminSection();
    }
  }

  private apply(response: DashboardResponse): void {
    this.roles.set(response.roles);
    this.authorSection.set(response.sections.author ?? null);
    this.reviewerSection.set(response.sections.reviewer ?? null);
    this.editorSection.set(response.sections.editor ?? null);
    this.adminSection.set(response.sections.admin ?? null);
  }
}
