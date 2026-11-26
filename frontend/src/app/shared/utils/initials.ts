import { SessionUser } from '../../core/models/session-user.model';

/**
 * Iniciales para el avatar (spec 005, FR-008): primera letra del nombre y del primer
 * apellido. Se leen de sus campos, no de `full_name`, que no separa apellidos compuestos.
 * Con un solo dato devuelve una letra y sin ninguno `null`.
 */
export function initialsOf(
  user: Pick<SessionUser, 'first_name' | 'last_name'> | null,
): string | null {
  // `Array.from` toma el primer carácter completo, aunque ocupe dos unidades UTF-16.
  const letters = [user?.first_name, user?.last_name]
    .map((value) => Array.from(value?.trim().normalize('NFC') ?? '')[0] ?? '')
    .join('');
  return letters ? letters.toLocaleUpperCase('es') : null;
}
