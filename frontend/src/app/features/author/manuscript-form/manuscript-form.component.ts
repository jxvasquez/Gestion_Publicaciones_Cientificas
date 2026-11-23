import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { UnsavedChangesAware } from '../../../core/auth/unsaved-changes.guard';
import { AuthStore } from '../../../core/auth/auth.store';
import { ApiError } from '../../../core/models/api-error.model';
import {
  Manuscript,
  ManuscriptAuthor,
  ManuscriptPayload,
  ManuscriptSnapshot,
  isEditable,
} from '../../../core/models/manuscript.model';
import { ManuscriptService } from '../../../core/services/manuscript.service';
import { ErrorStateComponent } from '../../../shared/components/error-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge.component';
import { authorRosterValidator, rosterMessages } from './author-roster.validator';
import { KEYWORD_MAX_LENGTH, parseKeywords } from './keywords';

type AuthorGroup = FormGroup<{
  full_name: FormControl<string>;
  email: FormControl<string>;
  affiliation: FormControl<string>;
  is_corresponding: FormControl<boolean>;
}>;

/** Campos del formulario que el backend valida y puede devolver en `details`. */
const SERVER_FIELDS = ['title', 'abstract', 'keywords', 'area', 'language'] as const;
type ServerField = (typeof SERVER_FIELDS)[number];

/** Metadatos que la presentación formal exige (CA-HU-04-02). */
const REQUIRED_LABELS: Record<ServerField, string> = {
  title: 'Título',
  abstract: 'Resumen',
  keywords: 'Palabras clave',
  area: 'Área de conocimiento',
  language: 'Idioma',
};

/** Validador de palabras clave: ninguna supera el máximo de la API. */
function keywordsLength(control: AbstractControl): ValidationErrors | null {
  const tooLong = parseKeywords(String(control.value ?? '')).some(
    (keyword) => keyword.length > KEYWORD_MAX_LENGTH,
  );
  return tooLong ? { keywordLength: KEYWORD_MAX_LENGTH } : null;
}

/** Al menos una palabra clave (solo en correcciones). */
function keywordsRequired(control: AbstractControl): ValidationErrors | null {
  return parseKeywords(String(control.value ?? '')).length === 0 ? { required: true } : null;
}

/**
 * Formulario reactivo de manuscrito: datos generales y `FormArray` de
 * autores (plan sección 3.5, HU-04 y HU-07).
 *
 * * Crea un borrador (`/new`) o edita los metadatos (`/:id/edit`), solo
 *   en `DRAFT` o `REQUIRES_CORRECTIONS`; en otro estado el formulario
 *   queda bloqueado y se explica por qué.
 * * **Bloquea el guardado** sin autores o sin exactamente un autor
 *   responsable, con correos repetidos o si el autor que registra no
 *   figura en la lista. Un campo de autor vacío también bloquea.
 * * Un borrador puede guardarse con metadatos incompletos
 *   (CA-HU-04-01): se avisa qué falta para poder enviarlo. En
 *   `REQUIRES_CORRECTIONS` esos campos pasan a ser obligatorios.
 * * Implementa `UnsavedChangesAware`: el guard avisa antes de abandonar.
 * * Un `409` por `ETag` desactualizado se explica y ofrece recargar.
 */
@Component({
  selector: 'app-manuscript-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LoadingSpinnerComponent,
    ErrorStateComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './manuscript-form.component.html',
  styleUrl: './manuscript-form.component.scss',
})
export class ManuscriptFormComponent implements UnsavedChangesAware {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly service = inject(ManuscriptService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthStore);

  /** Identificador del manuscrito en edición; `null` al crear. */
  protected readonly id = this.route.snapshot.paramMap.get('id');
  protected readonly isEdit = this.id !== null;

  readonly authors = new FormArray<AuthorGroup>([], {
    validators: [authorRosterValidator(() => this.auth.user()?.email ?? null)],
  });

  readonly form = this.formBuilder.group({
    title: ['', [Validators.maxLength(300)]],
    abstract: [''],
    keywords: ['', [keywordsLength]],
    area: ['', [Validators.maxLength(120)]],
    language: ['', [Validators.pattern(/^[a-z]{2}$/)]],
    authors: this.authors,
  });

  protected readonly loading = signal(false);
  protected readonly loadError = signal<ApiError | null>(null);
  protected readonly current = signal<Manuscript | null>(null);
  protected readonly locked = signal(false);
  protected readonly strict = signal(false);
  protected readonly saving = signal(false);
  protected readonly attempted = signal(false);
  protected readonly conflict = signal(false);
  protected readonly globalError = signal('');
  protected readonly authorsServerError = signal('');
  private readonly serverErrors = signal<Partial<Record<ServerField, string>>>({});

  private etag: string | null = null;

  private readonly value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  /** Metadatos que aún faltan para poder enviar el manuscrito. */
  protected readonly missingForSubmission = computed(() => {
    const value = this.value();
    const missing: string[] = [];
    for (const field of SERVER_FIELDS) {
      const text = String(value[field] ?? '').trim();
      const empty = field === 'keywords' ? parseKeywords(text).length === 0 : text === '';
      if (empty) {
        missing.push(REQUIRED_LABELS[field]);
      }
    }
    return missing;
  });

  protected readonly rosterErrors = computed(() => {
    this.value();
    return rosterMessages(this.authors.errors);
  });

  protected readonly blockingMessages = computed(() => {
    this.value();
    const messages = [...rosterMessages(this.authors.errors)];
    if (this.hasInvalidField()) {
      messages.push('Revise los campos marcados en rojo.');
    }
    return messages;
  });

  constructor() {
    if (this.isEdit) {
      this.load();
    } else {
      this.addAuthor(this.registrant());
      this.form.markAsPristine();
    }
  }

  /** Contrato del `unsavedChangesGuard`. */
  hasUnsavedChanges(): boolean {
    return this.form.dirty;
  }

  /** (Re)carga el manuscrito en edición; descarta los cambios no guardados. */
  protected load(): void {
    if (this.id === null) {
      return;
    }
    this.loading.set(true);
    this.loadError.set(null);
    this.conflict.set(false);
    this.globalError.set('');
    this.service.get(this.id).subscribe({
      next: (snapshot) => {
        this.fill(snapshot);
        this.loading.set(false);
      },
      error: (error: ApiError) => {
        this.loadError.set(error);
        this.loading.set(false);
      },
    });
  }

  protected addAuthor(author?: Partial<ManuscriptAuthor>): void {
    const first = this.authors.length === 0;
    this.authors.push(this.authorGroup({ is_corresponding: first, ...author }));
    this.authors.markAsDirty();
  }

  protected removeAuthor(index: number): void {
    if (this.authors.length <= 1) {
      return;
    }
    this.authors.removeAt(index);
    this.authors.markAsDirty();
  }

  /** Solo un autor puede ser el responsable: marcar uno desmarca al resto. */
  protected setResponsible(index: number): void {
    this.authors.controls.forEach((group, position) =>
      group.controls.is_corresponding.setValue(position === index),
    );
    this.authors.markAsDirty();
  }

  protected save(): void {
    if (this.saving() || this.locked()) {
      return;
    }
    this.attempted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }

    this.saving.set(true);
    this.globalError.set('');
    this.authorsServerError.set('');
    this.serverErrors.set({});
    this.conflict.set(false);

    const payload = this.buildPayload();
    if (this.id !== null && this.etag === null) {
      // Sin ETag no hay forma segura de editar: se pide recargar.
      this.saving.set(false);
      this.globalError.set('Recargue el manuscrito antes de guardar los cambios.');
      return;
    }
    const request =
      this.id !== null && this.etag !== null
        ? this.service.update(this.id, payload, this.etag)
        : this.service.create(payload);

    request.subscribe({
      next: ({ manuscript }) => {
        this.saving.set(false);
        // Guardado: el guard no debe advertir al navegar al detalle.
        this.form.markAsPristine();
        void this.router.navigate(['/app/author/manuscripts', manuscript.id]);
      },
      error: (error: ApiError) => {
        this.saving.set(false);
        this.showServerError(error);
      },
    });
  }

  protected invalid(field: ServerField): boolean {
    const control = this.form.controls[field];
    return (
      (control.invalid && (control.touched || this.attempted())) || !!this.serverErrors()[field]
    );
  }

  protected authorInvalid(group: AuthorGroup, field: keyof AuthorGroup['controls']): boolean {
    const control = group.controls[field];
    return control.invalid && (control.touched || this.attempted());
  }

  protected fieldMessage(field: ServerField): string {
    const server = this.serverErrors()[field];
    if (server) {
      return server;
    }
    const errors = this.form.controls[field].errors;
    if (errors?.['required']) {
      return 'Este campo es obligatorio.';
    }
    if (errors?.['pattern']) {
      return 'Use el código de idioma de dos letras en minúscula (por ejemplo, es).';
    }
    if (errors?.['keywordLength']) {
      return `Cada palabra clave admite hasta ${KEYWORD_MAX_LENGTH} caracteres.`;
    }
    if (errors?.['maxlength']) {
      return `Máximo ${errors['maxlength'].requiredLength} caracteres.`;
    }
    return 'Revise este campo.';
  }

  private hasInvalidField(): boolean {
    return (
      SERVER_FIELDS.some((field) => this.form.controls[field].invalid) ||
      this.authors.controls.some((group) => group.invalid)
    );
  }

  private registrant(): Partial<ManuscriptAuthor> {
    const user = this.auth.user();
    return user ? { full_name: user.full_name, email: user.email } : {};
  }

  private authorGroup(author: Partial<ManuscriptAuthor> = {}): AuthorGroup {
    return this.formBuilder.group({
      full_name: [author.full_name ?? '', [Validators.required, Validators.maxLength(200)]],
      email: [
        author.email ?? '',
        [Validators.required, Validators.email, Validators.maxLength(254)],
      ],
      affiliation: [author.affiliation ?? '', [Validators.required, Validators.maxLength(300)]],
      is_corresponding: [author.is_corresponding ?? false],
    });
  }

  /** Vuelca el manuscrito cargado al formulario y fija sus reglas. */
  private fill({ manuscript, etag }: ManuscriptSnapshot): void {
    this.etag = etag;
    this.current.set(manuscript);
    this.form.enable({ emitEvent: false });

    this.form.patchValue(
      {
        title: manuscript.title,
        abstract: manuscript.abstract,
        keywords: manuscript.keywords.join(', '),
        area: manuscript.area,
        language: manuscript.language,
      },
      { emitEvent: false },
    );
    this.authors.clear({ emitEvent: false });
    [...manuscript.authors]
      .sort((a, b) => (a.author_order ?? 0) - (b.author_order ?? 0))
      .forEach((author) => this.authors.push(this.authorGroup(author), { emitEvent: false }));

    // En correcciones los metadatos obligatorios ya no pueden quedar vacíos.
    const strict = manuscript.status === 'REQUIRES_CORRECTIONS';
    this.strict.set(strict);
    for (const field of SERVER_FIELDS) {
      const control = this.form.controls[field];
      control.removeValidators([Validators.required, keywordsRequired]);
      if (strict) {
        control.addValidators(field === 'keywords' ? keywordsRequired : Validators.required);
      }
    }

    const editable = isEditable(manuscript);
    this.locked.set(!editable);
    if (!editable) {
      this.form.disable({ emitEvent: false });
    }
    this.form.updateValueAndValidity();
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.attempted.set(false);
  }

  private buildPayload(): ManuscriptPayload {
    const value = this.form.getRawValue();
    return {
      title: value.title.trim(),
      abstract: value.abstract.trim(),
      keywords: parseKeywords(value.keywords),
      area: value.area.trim(),
      language: value.language.trim(),
      authors: value.authors.map((author) => ({
        full_name: author.full_name.trim(),
        email: author.email.trim(),
        affiliation: author.affiliation.trim(),
        is_corresponding: author.is_corresponding,
      })),
    };
  }

  /** Traduce el error del backend a mensajes junto a los campos. */
  private showServerError(error: ApiError): void {
    if (error.code === 'VERSION_CONFLICT') {
      this.conflict.set(true);
      return;
    }
    const details = error.details;
    if (error.status === 400 && details !== null && typeof details === 'object') {
      const fields = details as Record<string, unknown>;
      const byField: Partial<Record<ServerField, string>> = {};
      for (const field of SERVER_FIELDS) {
        const messages = flattenMessages(fields[field]);
        if (messages.length > 0) {
          byField[field] = messages.join(' ');
        }
      }
      const authorMessages = flattenMessages(fields['authors']);
      this.serverErrors.set(byField);
      this.authorsServerError.set(authorMessages.join(' '));
      if (authorMessages.length > 0 || Object.keys(byField).length > 0) {
        return;
      }
    }
    this.globalError.set(error.userMessage);
  }
}

/** Aplana los mensajes de DRF (`["msg"]`, `[{"email": ["msg"]}]`). */
function flattenMessages(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(flattenMessages);
  }
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(flattenMessages);
  }
  return [];
}
