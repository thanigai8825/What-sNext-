import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '../lib/cn'

const field =
  'w-full rounded-control border border-transparent bg-surface text-body text-ink outline-none transition-[border-color,background-color] duration-200 ease-apple placeholder:text-faint hover:bg-surface-hover focus:border-ink focus:bg-surface focus-visible:outline-none'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(field, 'h-12 px-4', className)} {...rest} />
})

interface AreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  minRows?: number
  maxHeight?: number
}

/** Grows with its content, up to maxHeight. */
export const TextArea = forwardRef<HTMLTextAreaElement, AreaProps>(function TextArea(
  { className, minRows = 3, maxHeight = 420, value, ...rest },
  outer,
) {
  const inner = useRef<HTMLTextAreaElement | null>(null)
  useLayoutEffect(() => {
    const el = inner.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(maxHeight, el.scrollHeight + 2)}px`
  }, [value, maxHeight])
  return (
    <textarea
      ref={(el) => {
        inner.current = el
        if (typeof outer === 'function') outer(el)
        else if (outer) outer.current = el
      }}
      rows={minRows}
      value={value}
      className={cn(field, 'resize-none px-4 py-3 leading-[22px]', className)}
      {...rest}
    />
  )
})

interface LineProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string
  onValue: (value: string) => void
}

/**
 * A one-line field that wraps instead of cutting text off: a bare textarea
 * that grows with its content and never takes a line break.
 */
export const LineField = forwardRef<HTMLTextAreaElement, LineProps>(function LineField({ value, onValue, onKeyDown, className, ...rest }, outer) {
  const inner = useRef<HTMLTextAreaElement | null>(null)
  const fit = useCallback(() => {
    const el = inner.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])
  useLayoutEffect(fit, [value, fit])
  // Re-wrap when the width changes (rotation, window resize).
  useEffect(() => {
    const el = inner.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let width = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      fit()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit])
  return (
    <textarea
      ref={(el) => {
        inner.current = el
        if (typeof outer === 'function') outer(el)
        else if (outer) outer.current = el
      }}
      rows={1}
      value={value}
      onChange={(e) => onValue(e.target.value.replace(/\s*[\r\n]+\s*/g, ' '))}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return
        onKeyDown?.(e)
        if (e.key === 'Enter') e.preventDefault()
      }}
      className={cn('block w-full resize-none overflow-hidden bg-transparent outline-none focus-visible:outline-none', className)}
      {...rest}
    />
  )
})
