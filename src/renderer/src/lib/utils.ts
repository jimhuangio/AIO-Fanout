import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatNumber(n: number): string {
  return n.toLocaleString()
}

export function formatPct(n: number): string {
  return `${n.toFixed(1)}%`
}

// Determine heat level (0-9) from a value and a max value
export function heatLevel(value: number, max: number): number {
  if (value === 0 || max === 0) return 0
  return Math.min(9, Math.ceil((value / max) * 9))
}
