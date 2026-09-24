import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Pencil, Trash2 } from 'lucide-react'
import { Button, IconButton, MicroLabel, TextArea } from '../design'
import { fieldLabel } from '../engine/kb'
import type { KBField, KBFieldKey } from '../engine/types'
import { spring, tBase } from '../lib/motion'
import { cn } from '../lib/cn'

interface Props {
  fields: KBField[]
  onConfirm: (key: KBFieldKey) => void
  onEdit: (key: KBFieldKey, value: string) => void
  onDelete: (key: KBFieldKey) => void
}

/** The imported profile as editable cards: confirm, edit, or delete each. */
export function ProfileCards({ fields, onConfirm, onEdit, onDelete }: Props) {
  return (
    <ul className="space-y-3">
      <AnimatePresence initial={false}>
        {fields.map((f, i) => (
          <motion.li
            key={f.key}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0, transition: { ...tBase, delay: i * 0.04 } }}
            exit={{ opacity: 0, scale: 0.97, transition: tBase }}
            transition={spring}
          >
            <ProfileCard field={f} onConfirm={onConfirm} onEdit={onEdit} onDelete={onDelete} />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  )
}

function ProfileCard({ field, onConfirm, onEdit, onDelete }: { field: KBField } & Omit<Props, 'fields'>) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(field.value)
  const label = fieldLabel(field.key)
  return (
    <div className={cn('rounded-card bg-surface p-4 transition-colors duration-300')}>
      <div className="flex min-h-8 items-center gap-2">
        <MicroLabel color={field.confirmed ? 'text-lavender' : 'text-ink-3'} className="flex-1">
          {label}
        </MicroLabel>
        <AnimatePresence>
          {field.confirmed && !editing && (
            <motion.span initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={spring} className="text-lavender">
              <Check size={16} strokeWidth={2} aria-label="Confirmed" />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      {editing ? (
        <div className="mt-2">
          <TextArea data-autofocus value={draft} minRows={2} onChange={(e) => setDraft(e.target.value)} aria-label={label} className="bg-canvas" />
          <div className="mt-2 flex justify-end gap-1">
            <Button
              variant="text"
              onClick={() => {
                setDraft(field.value)
                setEditing(false)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="text"
              className="text-ink"
              onClick={() => {
                onEdit(field.key, draft.trim())
                setEditing(false)
              }}
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1 text-body whitespace-pre-line text-ink text-pretty">{field.value}</p>
          <div className="-mb-2 -ml-2.5 mt-1 flex items-center">
            {!field.confirmed && <IconButton icon={Check} label={`Confirm ${label}`} onClick={() => onConfirm(field.key)} />}
            <IconButton icon={Pencil} label={`Edit ${label}`} size={18} onClick={() => setEditing(true)} />
            <IconButton icon={Trash2} label={`Delete ${label}`} size={18} onClick={() => onDelete(field.key)} />
          </div>
        </>
      )}
    </div>
  )
}
