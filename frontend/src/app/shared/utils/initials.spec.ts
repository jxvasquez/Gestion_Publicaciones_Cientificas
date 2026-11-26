import { initialsOf } from './initials';

describe('initialsOf', () => {
  const of = (first_name: string, last_name: string) => initialsOf({ first_name, last_name });

  it.each([
    ['Marcela', 'Quizhpe Ordóñez', 'MQ'],
    ['Ana María', 'López', 'AL'],
    ['ángel', 'ñuño', 'ÁÑ'],
    ['Ana', '', 'A'],
    ['', 'López', 'L'],
    ['  luis  ', '   pérez  ', 'LP'],
    ['   ', 'Cueva', 'C'],
  ])('con %j y %j da «%s»', (first, last, expected) => {
    expect(of(first, last)).toBe(expected);
  });

  it.each([
    ['', ''],
    ['   ', ' '],
  ])('sin nombre ni apellidos (%j, %j) no da iniciales', (first, last) => {
    expect(of(first, last)).toBeNull();
  });

  it('sin sesión no da iniciales', () => {
    expect(initialsOf(null)).toBeNull();
  });
});
