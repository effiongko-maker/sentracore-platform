import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { downloadBlob } from "@/modules/reports/export/filename";
import {
  installClonedComputedStyleSanitizer,
  sanitizeClonedColors,
} from "@/modules/reports/export/cssColorToRgba";

export function invoicePdfFilename(reference: string) {
  const base = reference
    .replace(/[^a-zA-Z0-9-_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return `${base || "Invoice"}.pdf`;
}

/**
 * Capture the customer-facing InvoiceDocument DOM as an A4 PDF.
 * Reuses the Reports html2canvas + jsPDF pipeline. Live DOM is untouched.
 */
export async function downloadInvoicePdf(
  reference: string,
  element: HTMLElement
): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
    onclone(clonedDocument, clonedElement) {
      installClonedComputedStyleSanitizer(clonedDocument);
      sanitizeClonedColors(clonedElement);
    },
  });

  const imgWidthMm = 210;
  const pageHeightMm = 297;
  const marginMm = 12;
  const usableWidth = imgWidthMm - marginMm * 2;
  const usableHeight = pageHeightMm - marginMm * 2;

  const imgHeightMm = (canvas.height * usableWidth) / canvas.width;
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageCanvas = document.createElement("canvas");
  const pageCtx = pageCanvas.getContext("2d");
  if (!pageCtx) {
    throw new Error("Unable to prepare invoice PDF.");
  }

  const pxPerMm = canvas.width / usableWidth;
  const pageHeightPx = Math.floor(usableHeight * pxPerMm);
  let renderedHeightMm = 0;
  let sourceY = 0;
  let pageIndex = 0;

  while (sourceY < canvas.height) {
    const sliceHeightPx = Math.min(pageHeightPx, canvas.height - sourceY);
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeightPx;
    pageCtx.fillStyle = "#ffffff";
    pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    pageCtx.drawImage(
      canvas,
      0,
      sourceY,
      canvas.width,
      sliceHeightPx,
      0,
      0,
      canvas.width,
      sliceHeightPx
    );

    const sliceData = pageCanvas.toDataURL("image/jpeg", 0.92);
    const sliceHeightMm = sliceHeightPx / pxPerMm;

    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(
      sliceData,
      "JPEG",
      marginMm,
      marginMm,
      usableWidth,
      sliceHeightMm
    );

    sourceY += sliceHeightPx;
    renderedHeightMm += sliceHeightMm;
    pageIndex += 1;

    if (pageIndex > 40 || renderedHeightMm > imgHeightMm + usableHeight) break;
  }

  downloadBlob(pdf.output("blob"), invoicePdfFilename(reference));
}
