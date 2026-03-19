export type EventCategory = "Morning" | "Afternoon" | "Evening";

export type EventRecord = {
  id: number;
  date: string;
  time: string;
  title: string;
  category: EventCategory;
  rsvp_count: number;
};

export const tripDates = [
  { id: "2026-03-25", label: "Wednesday, March 25", shortLabel: "Mar 25" },
  { id: "2026-03-26", label: "Thursday, March 26", shortLabel: "Mar 26" },
  { id: "2026-03-27", label: "Friday, March 27", shortLabel: "Mar 27" },
  { id: "2026-03-28", label: "Saturday, March 28", shortLabel: "Mar 28" },
  { id: "2026-03-29", label: "Sunday, March 29", shortLabel: "Mar 29" },
  { id: "2026-03-30", label: "Monday, March 30", shortLabel: "Mar 30" },
  { id: "2026-03-31", label: "Tuesday, March 31", shortLabel: "Mar 31" },
  { id: "2026-04-01", label: "Wednesday, April 1", shortLabel: "Apr 1" },
  { id: "2026-04-02", label: "Thursday, April 2", shortLabel: "Apr 2" },
  { id: "2026-04-03", label: "Friday, April 3", shortLabel: "Apr 3" },
  { id: "2026-04-04", label: "Saturday, April 4", shortLabel: "Apr 4" },
  { id: "2026-04-05", label: "Sunday, April 5", shortLabel: "Apr 5" },
  { id: "2026-04-06", label: "Monday, April 6", shortLabel: "Apr 6" },
] as const;

export const categoryOrder: EventCategory[] = ["Morning", "Afternoon", "Evening"];

export const categoryStyles: Record<EventCategory, { filled: string; empty: string }> = {
  Morning: {
    filled: "bg-[#d4af37] text-[#001f3f]",
    empty: "bg-slate-300/30 text-white/60",
  },
  Afternoon: {
    filled: "bg-[#3a7bd5] text-white",
    empty: "bg-slate-300/30 text-white/60",
  },
  Evening: {
    filled: "bg-[#001f3f] text-white border border-white/20",
    empty: "bg-slate-300/30 text-white/60",
  },
};

export function formatTimeLabel(time24: string) {
  const [hourText, minute] = time24.split(":");
  const hour = Number(hourText);

  if (Number.isNaN(hour) || !minute) {
    return time24;
  }

  const suffix = hour >= 12 ? "pm" : "am";
  const normalizedHour = hour % 12 || 12;
  const minutePart = minute === "00" ? "" : `:${minute}`;

  return `${normalizedHour}${minutePart}${suffix}`;
}
