import horizontalLogo from '@/assets/place-in-thyme-horizontal-2026.png';
import roundLogo from '@/assets/place-in-thyme-round-2026.png';
import { cn } from '@/lib/utils';

type BrandLogoProps = {
  variant?: 'horizontal' | 'round';
  className?: string;
};

export function BrandLogo({ variant = 'horizontal', className }: BrandLogoProps) {
  if (variant === 'round') {
    return (
      <img
        src={roundLogo}
        alt="Place in Thyme logo"
        width={1254}
        height={1254}
        loading="lazy"
        className={cn('h-24 w-24 shrink-0 rounded-full bg-white object-contain', className)}
      />
    );
  }

  return (
    <span className={cn('relative block aspect-[2.3/1] w-[150px] shrink-0 overflow-hidden rounded-sm bg-white md:w-[174px]', className)}>
      {/* Frame the artwork's empty outer margin without changing the supplied image. */}
      <img
        src={horizontalLogo}
        alt="Place in Thyme logo"
        width={1536}
        height={1024}
        className="absolute left-0 top-1/2 h-auto w-full max-w-none -translate-y-1/2"
      />
    </span>
  );
}
