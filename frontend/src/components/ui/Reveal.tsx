import React from 'react';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { cn } from '@/utils/cn';

export interface RevealProps extends React.HTMLAttributes<HTMLDivElement> {
  delayMs?: number;
  children: React.ReactNode;
}

/**
 * Editorial scroll-reveal wrapper using IntersectionObserver with clean transition timing.
 */
export const Reveal: React.FC<RevealProps> = ({
  delayMs = 0,
  className,
  style,
  children,
  ...props
}) => {
  const { ref, visible } = useScrollReveal<HTMLDivElement>();

  return (
    <div
      ref={ref}
      style={{
        transitionDelay: visible && delayMs > 0 ? `${delayMs}ms` : undefined,
        ...style,
      }}
      className={cn(visible ? 'reveal-visible' : 'reveal-hidden', className)}
      {...props}
    >
      {children}
    </div>
  );
};
