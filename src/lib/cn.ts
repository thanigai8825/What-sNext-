import { extendTailwindMerge } from 'tailwind-merge'

/** Knows our type scale, so `text-caption` overrides `text-body` and never fights a color. */
const merge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['timer', 'display', 'title', 'headline', 'body', 'caption', 'micro'],
      color: [
        'canvas', 'surface', 'surface-hover', 'line', 'line-strong', 'ink', 'ink-2', 'ink-3', 'faint', 'primary', 'on-primary',
        'secondary', 'on-secondary', 'ring', 'overlay', 'chrome', 'shimmer', 'toast', 'on-toast', 'sage', 'sage-bg', 'sage-fill',
        'sky', 'sky-bg', 'sand', 'sand-bg', 'blush', 'blush-bg', 'lavender', 'lavender-bg', 'white', 'black',
      ],
      radius: ['focus', 'card', 'control', 'inner', 'pill'],
      shadow: ['focus'],
    },
  },
})

export function cn(...parts: Array<string | false | null | undefined>) {
  return merge(parts.filter(Boolean).join(' '))
}
