import type { Car } from '../data/types';

const NBSP = ' ';

export function formatPrice(eur: number): string {
  return `${Math.round(eur).toLocaleString('fr-FR').replace(/\s/g, NBSP)}${NBSP}€`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('fr-FR').replace(/\s/g, NBSP);
}

export function formatPower(hp: number): string {
  return `${formatNumber(hp)}${NBSP}ch`;
}

export function formatYears(car: Car): string {
  return car.yearTo ? `${car.yearFrom} – ${car.yearTo}` : `${car.yearFrom} –`;
}

export function formatDiscoveredAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
