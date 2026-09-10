import { useEffect, useRef, type ElementType, type ReactNode } from 'react'

/* Scroll-reveal via IntersectionObserver. The reference design used GSAP +
 * ScrollTrigger + Lenis for this; that's ~120KB of dependency to fade elements
 * in, so this does it natively instead.
 *
 * Elements start hidden via CSS ([data-reveal] in landing.css) and are set to
 * 'shown' once. Content must never be trapped behind the animation, so there
 * are three ways it can be revealed:
 *   1. `immediate` — above-the-fold content shows on mount, no scroll needed.
 *   2. IntersectionObserver, for everything below the fold.
 *   3. A fallback for environments without IntersectionObserver at all. */

interface RevealProps {
  children: ReactNode
  /** Stagger, in ms, applied as a CSS custom property. */
  delay?: number
  /** Reveal on mount instead of on scroll. Use for anything above the fold. */
  immediate?: boolean
  as?: ElementType
  className?: string
}

export function Reveal({ children, delay = 0, immediate = false, as: Tag = 'div', className }: RevealProps) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function show() {
      el?.setAttribute('data-reveal', 'shown')
    }

    if (immediate || typeof IntersectionObserver === 'undefined') {
      // One frame later, so the browser paints the hidden state first and the
      // transition actually runs rather than being skipped.
      const raf = requestAnimationFrame(show)
      return () => cancelAnimationFrame(raf)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.setAttribute('data-reveal', 'shown')
          observer.unobserve(entry.target)
        }
      },
      // Fires slightly before the element reaches the fold so the motion has
      // finished by the time it's properly in view.
      { rootMargin: '0px 0px -8% 0px', threshold: 0.02 },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [immediate])

  return (
    <Tag
      ref={ref}
      data-reveal=""
      className={className}
      style={delay ? ({ '--reveal-delay': `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  )
}
