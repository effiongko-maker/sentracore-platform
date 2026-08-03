import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions) {
  const value = typeof date === "string" ? new Date(date) : date;
  return value.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options,
  });
}

export function formatRelativeTime(date: string | Date) {
  const value = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - value.getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return formatDate(value);
}
