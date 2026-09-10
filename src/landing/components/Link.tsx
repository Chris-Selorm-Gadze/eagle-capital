import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { handleLinkClick } from '../routes'

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string
  children: ReactNode
}

/** Internal link. Renders a real <a href> so middle-click, right-click and
 * crawlers all behave, but routes client-side on a plain left-click. */
export function Link({ to, children, ...rest }: LinkProps) {
  return (
    <a href={to} onClick={(e) => handleLinkClick(e, to)} {...rest}>
      {children}
    </a>
  )
}
