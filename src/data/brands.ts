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
    aliases: ['mercedes', 'mercedes benz', 'mercedesbenz', 'benz', 'amg'],
  },
  { id: 'audi', name: 'Audi', country: 'Allemagne', aliases: ['audi'] },
  { id: 'volkswagen', name: 'Volkswagen', country: 'Allemagne', aliases: ['volkswagen', 'vw'] },
  { id: 'tesla', name: 'Tesla', country: 'États-Unis', aliases: ['tesla'] },
  { id: 'ford', name: 'Ford', country: 'États-Unis', aliases: ['ford'] },
  { id: 'toyota', name: 'Toyota', country: 'Japon', aliases: ['toyota'] },
  { id: 'renault', name: 'Renault', country: 'France', aliases: ['renault'] },
  { id: 'peugeot', name: 'Peugeot', country: 'France', aliases: ['peugeot'] },
  { id: 'citroen', name: 'Citroën', country: 'France', aliases: ['citroen', 'citroën', 'ds'] },
  { id: 'dacia', name: 'Dacia', country: 'Roumanie', aliases: ['dacia'] },
  { id: 'fiat', name: 'Fiat', country: 'Italie', aliases: ['fiat', 'abarth'] },
  { id: 'alfa-romeo', name: 'Alfa Romeo', country: 'Italie', aliases: ['alfa romeo', 'alfa', 'alfaromeo'] },
  { id: 'maserati', name: 'Maserati', country: 'Italie', aliases: ['maserati'] },
  { id: 'mini', name: 'Mini', country: 'Royaume-Uni', aliases: ['mini', 'mini cooper'] },
  {
    id: 'land-rover',
    name: 'Land Rover',
    country: 'Royaume-Uni',
    aliases: ['land rover', 'landrover', 'range rover', 'rangerover'],
  },
  { id: 'aston-martin', name: 'Aston Martin', country: 'Royaume-Uni', aliases: ['aston martin', 'aston'] },
  { id: 'mclaren', name: 'McLaren', country: 'Royaume-Uni', aliases: ['mclaren', 'mc laren'] },
  { id: 'volvo', name: 'Volvo', country: 'Suède', aliases: ['volvo'] },
  { id: 'nissan', name: 'Nissan', country: 'Japon', aliases: ['nissan', 'datsun'] },
  { id: 'hyundai', name: 'Hyundai', country: 'Corée du Sud', aliases: ['hyundai'] },
  { id: 'kia', name: 'Kia', country: 'Corée du Sud', aliases: ['kia'] },
];

export const BRANDS_BY_ID: Record<string, Brand> = Object.fromEntries(
  BRANDS.map((brand) => [brand.id, brand]),
);

export function getBrand(brandId: string | null | undefined): Brand | undefined {
  return brandId ? BRANDS_BY_ID[brandId] : undefined;
}
