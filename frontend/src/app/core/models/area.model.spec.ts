import { areaNames } from './area.model';

describe('areaNames', () => {
  it('une los nombres con coma', () => {
    expect(
      areaNames([
        { code: 'agronomia', name: 'Agronomía' },
        { code: 'derecho', name: 'Derecho' },
      ]),
    ).toBe('Agronomía, Derecho');
  });

  it.each([[null], [undefined], [[]]])('sin carreras (%j) devuelve vacío', (areas) => {
    expect(areaNames(areas)).toBe('');
  });
});
