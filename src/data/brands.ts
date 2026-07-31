import type { Brand } from './types';

export const BRANDS: Brand[] = [
  { id: 'ferrari', name: 'Ferrari', country: 'Italie', aliases: ['ferrari'] },
  { id: 'lamborghini', name: 'Lamborghini', country: 'Italie', aliases: ['lamborghini', 'lambo'] },
  { id: 'porsche', name: 'Porsche', country: 'Allemagne', aliases: ['porsche'] },
  { id: 'bmw', name: 'BMW', country: 'Allemagne', aliases: ['bmw', 'bayerische motoren werke'] },
  {
    id: 'mercedes',
    name: 'Mercedes-Benz',
    country: 'Allemagne',
    aliases: ['mercedes', 'mercedes benz', 'mercedesbenz', 'benz', 'mb', 'amg'],
  },
  { id: 'audi', name: 'Audi', country: 'Allemagne', aliases: ['audi'] },
  { id: 'volkswagen', name: 'Volkswagen', country: 'Allemagne', aliases: ['volkswagen', 'vw'] },
  { id: 'tesla', name: 'Tesla', country: 'États-Unis', aliases: ['tesla'] },
  { id: 'ford', name: 'Ford', country: 'États-Unis', aliases: ['ford'] },
  { id: 'toyota', name: 'Toyota', country: 'Japon', aliases: ['toyota'] },
  { id: 'renault', name: 'Renault', country: 'France', aliases: ['renault'] },
  { id: 'peugeot', name: 'Peugeot', country: 'France', aliases: ['peugeot'] },
];

export const BRANDS_BY_ID: Record<string, Brand> = Object.fromEntries(
  BRANDS.map((brand) => [brand.id, brand]),
);

export function getBrand(brandId: string | null | undefined): Brand | undefined {
  return brandId ? BRANDS_BY_ID[brandId] : undefined;
}
