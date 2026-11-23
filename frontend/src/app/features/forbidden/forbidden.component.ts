import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Página `403` visual (plan sección 3.3): el `rolesGuard` trae aquí
 * cuando la persona autenticada no tiene el rol del módulo. Usa el
 * rojo de la paleta para acciones restringidas y ofrece volver al
 * panel unificado, que siempre está habilitado para cualquier rol.
 */
@Component({
  selector: 'app-forbidden',
  imports: [RouterLink],
  templateUrl: './forbidden.component.html',
  styleUrl: './forbidden.component.scss',
})
export class ForbiddenComponent {}
