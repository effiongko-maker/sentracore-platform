import Image from "next/image";
import { cn } from "@/lib/utils";

export const SENTRACORE_LOGO_SRC = "/brand/sentracore-logo.png";

type SentraCoreLogoProps = {
  /** Display size in pixels (square). */
  size?: number;
  className?: string;
  /** Decorative marks should pass an empty alt; meaningful marks keep default. */
  alt?: string;
  priority?: boolean;
};

/**
 * Official SentraCore logo mark — use the supplied asset only.
 * Do not recreate, filter, or wrap in decorative icon containers.
 */
export function SentraCoreLogo({
  size = 32,
  className,
  alt = "SentraCore",
  priority = false,
}: SentraCoreLogoProps) {
  return (
    <Image
      src={SENTRACORE_LOGO_SRC}
      alt={alt}
      width={size}
      height={size}
      priority={priority}
      className={cn("sc-brand-logo", className)}
      style={{ width: size, height: size }}
    />
  );
}
