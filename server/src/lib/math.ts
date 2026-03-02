export const SECONDS_PER_HOUR = 3600;

export function snapToHalf(value: number): number {
  return Math.round(value / 0.5) * 0.5;
}
