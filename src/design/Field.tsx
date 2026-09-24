import { forwardRef, useLayoutEffect, useRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
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
