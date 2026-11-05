/**
 * Helper to format a date into human-readable relative time (e.g. "5 min ago", "2 hr ago")
 * Calculates purely from real date timestamps without hardcoded strings.
 */
export function formatRelativeTime(dateInput) {
  if (!dateInput) return "Recently";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "Recently";

  const now = new Date();
  const diffSec = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));

  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} hr ago`;
  const diffDays = Math.floor(diffHour / 24);
  return `${diffDays} d ago`;
}
