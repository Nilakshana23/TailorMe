import { useState } from 'react'
import FormInput from './FormInput'

type PasswordInputProps = { id: string; label: string; error?: string }

export default function PasswordInput({ id, label, error }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  return <FormInput id={id} name={id} label={label} error={error} required minLength={8}
    type={visible ? 'text' : 'password'} autoComplete="new-password" placeholder="At least 8 characters"
    trailingControl={<button type="button" className="absolute right-0 top-0 min-w-11 min-h-11 flex items-center justify-center"
      aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible} aria-controls={id}
      onClick={() => setVisible((value) => !value)}>
      <span aria-hidden="true" className="material-symbols-outlined">{visible ? 'visibility_off' : 'visibility'}</span>
    </button>} />
}
