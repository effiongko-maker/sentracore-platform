const COLOR_STYLE_KEYS = [
  "color",
  "backgroundColor",
  "borderColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "outlineColor",
  "fill",
  "stroke",
  "caretColor",
  "columnRuleColor",
  "textDecorationColor",
  "textEmphasisColor",
] as const;

let sampleCtx: CanvasRenderingContext2D | null = null;

function getSampleContext(): CanvasRenderingContext2D | null {
  if (sampleCtx) return sampleCtx;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  sampleCtx = canvas.getContext("2d", { willReadFrequently: true });
  return sampleCtx;
}

export function isModernCssColor(value: string): boolean {
  return /oklab\s*\(|oklch\s*\(|color\s*\(/i.test(value);
}

/**
 * Convert any browser-paintable CSS color (including oklab/oklch) to rgba().
 * Uses a 1×1 canvas so conversion happens in the browser, not via string parsing.
 */
export function cssColorToRgba(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "transparent" || trimmed === "none") {
    return null;
  }

  const ctx = getSampleContext();
  if (!ctx) return null;

  try {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000000";
    ctx.fillStyle = trimmed;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgba(${r}, ${g}, ${b}, ${Number((a / 255).toFixed(4))})`;
  } catch {
    return null;
  }
}

function sanitizeColorValue(value: string): string {
  if (!isModernCssColor(value)) return value;
  return cssColorToRgba(value) ?? value;
}

/**
 * Modern browsers may serialize computed colors as oklab/oklch even after
 * inline rgba is applied. Patch getComputedStyle on the cloned document only
 * so html2canvas receives rgb/rgba strings. Live window is untouched.
 */
export function installClonedComputedStyleSanitizer(
  clonedDocument: Document
): void {
  const view = clonedDocument.defaultView;
  if (!view) return;

  const originalGetComputedStyle = view.getComputedStyle.bind(view);

  view.getComputedStyle = ((
    elt: Element,
    pseudoElt?: string | null
  ): CSSStyleDeclaration => {
    const style = originalGetComputedStyle(elt, pseudoElt);
    return new Proxy(style, {
      get(target, prop, receiver) {
        if (prop === "getPropertyValue") {
          return (property: string) =>
            sanitizeColorValue(target.getPropertyValue(property));
        }

        const value = Reflect.get(target, prop, receiver);
        if (typeof value === "string") {
          return sanitizeColorValue(value);
        }
        if (typeof value === "function") {
          return value.bind(target);
        }
        return value;
      },
    });
  }) as typeof view.getComputedStyle;
}

/**
 * Also stamp rgba() inline on the clone for color props that currently
 * compute to Color Level 4 values (helps non-getComputedStyle readers).
 */
export function sanitizeClonedColors(root: HTMLElement): void {
  const view = root.ownerDocument.defaultView ?? window;
  const nodes: Element[] = [root, ...Array.from(root.querySelectorAll("*"))];

  for (const node of nodes) {
    if (!(node instanceof HTMLElement) && !(node instanceof SVGElement)) {
      continue;
    }

    const computed = view.getComputedStyle(node);
    const style = node.style;

    for (const prop of COLOR_STYLE_KEYS) {
      const cssName = prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      const value =
        computed.getPropertyValue(cssName) ||
        (computed as unknown as Record<string, string>)[prop];

      if (typeof value !== "string" || !isModernCssColor(value)) continue;

      const rgba = cssColorToRgba(value);
      if (!rgba) continue;
      style.setProperty(cssName, rgba, "important");
    }
  }
}
