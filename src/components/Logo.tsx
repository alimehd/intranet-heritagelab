import Image from "next/image";

// The wordmark asset is 11493 × 2363, so it must be sized by height and let the
// width follow the ratio — squeezing it into a square box makes it unreadable.
const ASPECT_RATIO = 11493 / 2363;

export function Logo({
  height = 32,
  className,
  priority = false,
}: {
  height?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo.png"
      alt="heritagelab"
      width={Math.round(height * ASPECT_RATIO)}
      height={height}
      priority={priority}
      className={className}
    />
  );
}
