import type { HTMLAttributes } from 'react';

import { cn } from '../../lib/utils';

type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  shimmer?: boolean;
};

export const Skeleton = ({
  className,
  shimmer = true,
  ...props
}: SkeletonProps) => (
  <div
    aria-hidden={props['aria-hidden'] ?? true}
    className={cn(
      'untask-skeleton rounded-md',
      !shimmer ? 'untask-skeleton-static' : '',
      className,
    )}
    {...props}
  />
);
