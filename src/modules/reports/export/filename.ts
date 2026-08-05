export function reportFilename(title: string, ext: string): string {
  const base = title
    .replace(/[^a-zA-Z0-9-_ ]+/g, "")
    .trim()
    .replace(/\s+/g, "_");
  const stamp = new Date().toISOString().slice(0, 10);
  return `${base || "Facility_Report"}_${stamp}.${ext}`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
