import { NavLink, useLocation } from 'react-router'
import { motion } from 'motion/react'
import { ArrowUpRight, ListChecks, Settings, Target, CalendarRange } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'
import { spring } from '../lib/motion'

interface Item {
  to: string
  label: string
  icon: LucideIcon
}

export const NAV: Item[] = [
  { to: '/', label: 'Now', icon: ArrowUpRight },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/review', label: 'Review', icon: CalendarRange },
]

function isActive(path: string, to: string) {
  return to === '/' ? path === '/' : path.startsWith(to)
}

/** Mobile: four tabs, glass background. */
export function TabBar() {
  const { pathname } = useLocation()
  return (
    <nav aria-label="Main" className="glass fixed inset-x-0 bottom-0 z-30 border-t border-line pb-safe md:hidden">
      <ul className="mx-auto flex h-16 max-w-[640px] items-stretch px-2">
        {NAV.map((item) => {
          const active = isActive(pathname, item.to)
          const Icon = item.icon
          return (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={cn('flex h-full flex-col items-center justify-center gap-1 transition-colors duration-200', active ? 'text-ink' : 'text-ink-3')}
              >
                <motion.span animate={{ y: active ? -1 : 0, scale: active ? 1.04 : 1 }} transition={spring}>
                  <Icon size={20} strokeWidth={1.5} aria-hidden />
                </motion.span>
                <span className="text-micro font-medium">{item.label}</span>
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Desktop: slim left sidebar, same four items, Settings at the bottom. */
export function Sidebar() {
  const { pathname } = useLocation()
  const link = (item: Item) => {
    const active = isActive(pathname, item.to)
    const Icon = item.icon
    return (
      <NavLink
        key={item.to}
        to={item.to}
        aria-current={active ? 'page' : undefined}
        className={cn('relative flex h-10 items-center gap-3 rounded-inner px-3 text-body transition-colors duration-200', active ? 'text-ink' : 'text-ink-2 hover:text-ink')}
      >
        {active && <motion.span layoutId="sidebar-active" className="absolute inset-0 rounded-inner bg-surface" transition={spring} />}
        <Icon size={20} strokeWidth={1.5} className="relative" aria-hidden />
        <span className={cn('relative', active && 'font-medium')}>{item.label}</span>
      </NavLink>
    )
  }
  return (
    <nav aria-label="Main" className="fixed inset-y-0 left-0 z-30 hidden w-[208px] flex-col border-r border-line px-3 py-6 md:flex">
      <div className="mb-8 flex items-center gap-2.5 px-3">
        <Mark />
        <span className="text-body font-semibold tracking-[-0.01em]">What's Next</span>
      </div>
      <div className="flex flex-col gap-0.5">{NAV.map(link)}</div>
      <div className="mt-auto">{link({ to: '/settings', label: 'Settings', icon: Settings })}</div>
    </nav>
  )
}

export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <rect width="24" height="24" rx="7" className="fill-ink" />
      <path d="M8.5 15.5 15.5 8.5M10 8.5h5.5V14" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="stroke-canvas" />
    </svg>
  )
}
