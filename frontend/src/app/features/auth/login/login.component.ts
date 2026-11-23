import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/models/api-error.model';

/**
 * Pantalla pública de acceso institucional (plan sección 3.5).
 *
 * * Credenciales institucionales (id, usuario o correo + contraseña).
 * * Todo fallo muestra el mensaje genérico del envelope del backend
 *   ("Credenciales institucionales inválidas.", bloqueo temporal…):
 *   nunca revela si la cuenta existe ni por qué falló.
 * * Tras entrar redirige a `returnUrl` cuando es una ruta interna
 *   segura; al panel unificado en caso contrario. El panel muestra
 *   los módulos de todos los roles activos: aquí no existe ninguna
 *   pantalla de selección de rol.
 */
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Mensaje genérico del envelope; vacío cuando no hay fallo. */
  readonly errorMessage = signal('');
  readonly submitting = signal(false);

  readonly form = this.formBuilder.group({
    identifier: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    const { identifier, password } = this.form.getRawValue();
    this.errorMessage.set('');
    this.submitting.set(true);

    this.auth.login(identifier.trim(), password).subscribe({
      complete: () => {
        this.submitting.set(false);
        void this.router.navigateByUrl(this.returnUrl());
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(toLoginMessage(error));
      },
    });
  }

  /**
   * `returnUrl` solo se respeta si es una ruta interna segura del
   * propio origen (empieza por `/` y no por `//`); cualquier otra
   * cosa lleva al panel unificado.
   */
  private returnUrl(): string {
    const raw = this.route.snapshot.queryParamMap.get('returnUrl') ?? '';
    const isSafeInternal = raw.startsWith('/') && !raw.startsWith('//');
    return isSafeInternal ? raw : '/app/dashboard';
  }
}

/**
 * Mensaje genérico del login (plan sección 6.1): el envelope del
 * backend ya trae el texto neutro ("Credenciales institucionales
 * inválidas.", "Demasiados intentos fallidos…"); se usa tal cual y
 * solo se recurre al normalizado si el envelope llegó vacío.
 */
function toLoginMessage(error: unknown): string {
  const apiError = error as Partial<ApiError> | null;
  if (apiError?.message) {
    return apiError.message;
  }
  return apiError?.userMessage ?? 'No fue posible iniciar sesión. Intente de nuevo.';
}
