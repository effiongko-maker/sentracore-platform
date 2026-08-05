import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import type { ClientReportDocument } from "../types";
import {
  installClonedComputedStyleSanitizer,
  sanitizeClonedColors,
} from "./cssColorToRgba";
import { downloadBlob, reportFilename } from "./filename";

/**
 * Capture the on-screen report preview and produce a multi-page A4 PDF.
 * Matches the preview layout the user is viewing.
 *
 * PDF-only: the cloned document rewrites oklab/oklch computed colors to rgba
 * so html2canvas 1.4.1 can parse them. The live application DOM is untouched.
 */
export async function downloadReportPdf(
  report: ClientReportDocument,
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
  const marginMm = 10;
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
    throw new Error("Unable to prepare PDF canvas.");
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

    // Safety guard for extremely tall documents
    if (pageIndex > 40 || renderedHeightMm > imgHeightMm + usableHeight) break;
  }

  const blob = pdf.output("blob");
  downloadBlob(blob, reportFilename(report.title, "pdf"));
}
