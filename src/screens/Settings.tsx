import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Bell, BookUser, Cloud, Moon, RotateCcw, Sparkles, Sun, Sunrise, Target, Trash2, User } from 'lucide-react'
import { Button, Input, LargeTitle, ListGroup, ListRow, Page, Segmented, Sheet, SheetHeader, Toggle } from '../design'
import { hmLabel } from '../engine/time'
import { linkEmail, signOut, useSync } from '../data/sync'
import { supabaseConfigured } from '../data/supabase'
import { requestNotifications } from '../lib/notify'
import { useApp, type Theme } from '../store/app'
import { useUI, withUndo } from '../store/ui'

function TimeInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <span className="relative">
      <span className="text-body text-ink-2">{hmLabel(value)}</span>
      <input type="time" aria-label={label} value={value} onChange={(e) => e.target.value && onChange(e.target.value)} className="absolute inset-0 w-full cursor-pointer opacity-0" />
    </span>
  )
}

export function SettingsScreen() {
  const navigate = useNavigate()
  const settings = useApp((s) => s.settings)
  const set = useApp((s) => s.setSettings)
  const kb = useApp((s) => s.kb)
  const aiEnabled = useUI((s) => s.aiEnabled)
  const sync = useSync()
  const [confirm, setConfirm] = useState<'kb' | 'all' | null>(null)
  const [syncOpen, setSyncOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState(settings.name)

  const enableMorning = async (on: boolean) => {
    if (on && !(await requestNotifications())) {
      useUI.getState().showToast('Notifications are blocked in your browser settings.')
      return
    }
    set({ morningEnabled: on })
  }

  return (
    <Page>
      <LargeTitle>Settings</LargeTitle>

      <ListGroup title="Profile">
        <ListRow
          icon={User}
          label="Name"
          accessory={
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => set({ name: nameDraft.trim() })}
              placeholder="Optional"
              aria-label="Name"
              className="w-40 bg-transparent text-right text-body text-ink-2 outline-none placeholder:text-faint focus:text-ink"
            />
          }
        />
        {supabaseConfigured && (
          <ListRow
            icon={Cloud}
            label="Sync across devices"
            detail={sync.state === 'account' ? sync.email : sync.state === 'error' ? 'Paused' : sync.state === 'connecting' ? 'Connecting' : 'This device only'}
            chevron
            onClick={() => setSyncOpen(true)}
          />
        )}
      </ListGroup>

      <ListGroup title="Goals">
        <ListRow icon={Target} label="Manage goals" chevron onClick={() => navigate('/goals')} />
      </ListGroup>

      <ListGroup title="Knowledge base" footer="Private. Used only for your recommendations.">
        <ListRow icon={BookUser} label="View and edit" detail={kb ? `${kb.fields.length} ${kb.fields.length === 1 ? 'card' : 'cards'}` : 'Not set up'} chevron onClick={() => navigate('/settings/knowledge')} />
        <ListRow icon={RotateCcw} label={kb ? 'Re-import' : 'Import'} chevron onClick={() => navigate('/settings/knowledge?import=1')} />
        {kb && <ListRow icon={Trash2} label="Delete knowledge base" tone="blush" onClick={() => setConfirm('kb')} />}
      </ListGroup>

      <ListGroup title="Notifications" footer="The morning nudge needs this tab open, or the app installed.">
        <ListRow icon={Sunrise} label="Morning nudge" accessory={<Toggle checked={settings.morningEnabled} onChange={enableMorning} label="Morning nudge" />} />
        {settings.morningEnabled && <ListRow label={<span className="pl-8">Time</span>} accessory={<TimeInput value={settings.morningTime} onChange={(v) => set({ morningTime: v })} label="Morning nudge time" />} />}
        <ListRow icon={Bell} label="Welcome-back nudges" accessory={<Toggle checked={settings.nudgesEnabled} onChange={(v) => set({ nudgesEnabled: v })} label="Welcome-back nudges" />} />
        <ListRow icon={Moon} label="Evening check-in" accessory={<Toggle checked={settings.eveningEnabled} onChange={(v) => set({ eveningEnabled: v })} label="Evening check-in" />} />
        {settings.eveningEnabled && <ListRow label={<span className="pl-8">Time</span>} accessory={<TimeInput value={settings.eveningTime} onChange={(v) => set({ eveningTime: v })} label="Evening check-in time" />} />}
      </ListGroup>

      <ListGroup title="Appearance">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Sun size={20} strokeWidth={1.5} className="text-ink-2" aria-hidden />
          <Segmented<Theme>
            className="flex-1"
            label="Appearance"
            value={settings.theme}
            onChange={(theme) => set({ theme })}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System' },
            ]}
          />
        </div>
      </ListGroup>

      <ListGroup title="Privacy" footer={supabaseConfigured ? 'Your data lives on this device and in your private account.' : 'Everything stays on this device.'}>
        <ListRow icon={Trash2} label="Delete all data" tone="blush" onClick={() => setConfirm('all')} />
      </ListGroup>

      <p className="flex items-center gap-2 px-4 text-caption text-ink-3">
        <Sparkles size={14} strokeWidth={1.5} aria-hidden />
        {aiEnabled ? 'AI refinement is on.' : 'Using the built-in prioritization engine.'}
      </p>

      <ConfirmSheet
        open={confirm === 'kb'}
        title="Delete your knowledge base?"
        detail="Your picks will rely on what you do from now on. You can import again any time."
        action="Delete"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null)
          withUndo('Knowledge base deleted', () => useApp.getState().deleteKB())
        }}
      />
      <ConfirmSheet
        open={confirm === 'all'}
        title="Delete everything?"
        detail="Goals, tasks, history and your profile are removed from this device. This can’t be undone after a few seconds."
        action="Delete everything"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null)
          withUndo('Everything deleted', () => useApp.getState().resetAll())
        }}
      />
      <SyncSheet open={syncOpen} onClose={() => setSyncOpen(false)} />
    </Page>
  )
}

function ConfirmSheet({ open, title, detail, action, onCancel, onConfirm }: { open: boolean; title: string; detail: string; action: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Sheet open={open} onClose={onCancel} label={title}>
      <SheetHeader title={title} detail={detail} />
      <Button full onClick={onConfirm}>
        {action}
      </Button>
      <div className="mt-2 flex justify-center">
        <Button variant="text" onClick={onCancel} data-autofocus>
          Cancel
        </Button>
      </div>
    </Sheet>
  )
}

function SyncSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sync = useSync()
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const res = await linkEmail(email.trim())
    setMsg(res.message)
  }
  return (
    <Sheet open={open} onClose={onClose} label="Sync across devices">
      {sync.state === 'account' ? (
        <>
          <SheetHeader title="Synced" detail={`Your goals and tasks follow ${sync.email} to any device.`} />
          <Button variant="secondary" full onClick={() => void signOut().then(onClose)}>
            Sign out
          </Button>
        </>
      ) : (
        <form onSubmit={submit}>
          <SheetHeader title="Keep it on every device" detail="Add your email. We’ll send a link. Everything on this device comes with you." />
          <Input data-autofocus type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-label="Email" autoComplete="email" />
          {msg && <p className="mt-3 text-caption text-ink-2">{msg}</p>}
          <Button type="submit" full className="mt-6" disabled={!email.includes('@')}>
            Send link
          </Button>
        </form>
      )}
    </Sheet>
  )
}
