// ─────────────────────────────────────────────────────────────────────────────
// Shared decimal → number transformer
// TypeORM returns DECIMAL/NUMERIC columns as strings from the pg driver.
// This transformer ensures the value is always returned as a JS number.
// ─────────────────────────────────────────────────────────────────────────────
export const numericTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | number | null): number | null => {
    if (value === null || value === undefined) return null;
    return typeof value === 'string' ? parseFloat(value) : value;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Time-string transformer
// TypeORM returns TIME columns as strings like "06:00:00".
// The frontend expects "HH:MM" (no seconds).
// ─────────────────────────────────────────────────────────────────────────────
export const timeTransformer = {
  to: (value: string | null): string | null => value,
  from: (value: string | null): string | null => {
    if (!value) return null;
    // "06:00:00" → "06:00"
    return value.length > 5 ? value.slice(0, 5) : value;
  },
};
