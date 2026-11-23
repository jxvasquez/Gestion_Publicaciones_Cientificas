import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Encabezado de las páginas públicas (catálogo): nombre del sistema y
 * acceso a la sesión institucional. No lee ni muestra datos de sesión.
 */
@Component({
  selector: 'app-public-header',
  imports: [RouterLink],
  templateUrl: './public-header.component.html',
  styleUrl: './public-header.component.scss',
})
export class PublicHeaderComponent {}
