import { useNavigate } from 'react-router'
import { Settings } from 'lucide-react'
import { IconButton } from '../design'

/** Settings lives in the sidebar on desktop; on mobile it's a quiet icon in the header. */
export function SettingsButton() {
  const navigate = useNavigate()
  return <IconButton icon={Settings} label="Settings" onClick={() => navigate('/settings')} className="-mr-2.5 md:hidden" />
}
