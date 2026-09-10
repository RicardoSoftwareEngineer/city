/**
 * dayNightPersist — Hours-only day/night preference in localStorage.
 * Key: city-day-night-v1 → { hours: number } in [0, 24].
 * Missing / invalid → caller keeps controller default (noon).
 */

export const DAY_NIGHT_STORAGE_KEY = 'city-day-night-v1';

/** Default when nothing saved (matches slider value="12" / DayNight DEFAULT_T). */
export const DAY_NIGHT_DEFAULT_HOURS = 12;

/**
 * @returns {number | null} clamped hours, or null if missing/invalid
 */
export function loadDayNightHours() {
  try {
    const raw = localStorage.getItem(DAY_NIGHT_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const h = Number(data?.hours);
    if (!Number.isFinite(h)) return null;
    return Math.min(24, Math.max(0, h));
  } catch {
    return null;
  }
}

/**
 * @param {number} hours
 */
export function saveDayNightHours(hours) {
  const h = Number(hours);
  if (!Number.isFinite(h)) return;
  const clamped = Math.min(24, Math.max(0, h));
  try {
    localStorage.setItem(DAY_NIGHT_STORAGE_KEY, JSON.stringify({ hours: clamped }));
  } catch {
    // Quota / private mode — ignore
  }
}
