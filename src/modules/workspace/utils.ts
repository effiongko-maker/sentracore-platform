export function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function isSameDay(iso: string | undefined, asOf: string): boolean {
  if (!iso) return false;
  return dayKey(iso) === dayKey(asOf);
}

export function firstName(fullName?: string): string {
  const value = fullName?.trim();
  if (!value) return "";
  return value.split(/\s+/)[0] ?? value;
}

export function labelize(value?: string): string {
  if (!value) return "";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
