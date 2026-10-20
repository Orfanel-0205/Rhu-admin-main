// src/lib/localDate.ts
//
// "YYYY-MM-DD" on the browser's own clock -- Manila, on every RHU computer.
//
// date.toISOString().slice(0, 10) gives the UTC date. That is yesterday until
// 8:00 AM in Manila, so "today" and "last 30 days" ended a day early; and a
// date built at local midnight (new Date(); setHours(0,0,0,0)) is 4:00 PM the
// day before in UTC, so the heatmap's day buckets were each labelled one day
// late and today's cases had no bucket at all (Oct 2026).

export function localDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
