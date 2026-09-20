import type { HTMLAttributes } from "react";

type SkeletonProps = HTMLAttributes<HTMLDivElement>;

export function SkeletonBlock({ className = "", ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-sm bg-[#E8EDF2] motion-safe:animate-pulse motion-reduce:animate-none ${className}`}
      {...props}
    />
  );
}

export function SkeletonLine({ className = "", ...props }: SkeletonProps) {
  return <SkeletonBlock className={`h-3 ${className}`} {...props} />;
}
