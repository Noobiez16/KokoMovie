interface ToggleSwitchProps {
  /** Current on/off state. */
  checked: boolean
  /** Called with the *next* value when the user toggles it. */
  onChange: (next: boolean) => void
  disabled?: boolean
  /** Accessible name, used as `aria-label` when there's no associated visible label. */
  label?: string
  id?: string
}

/**
 * Accessible toggle / switch.
 *
 * - Proper `role="switch"` + `aria-checked` (a screen reader announces "on/off", not just
 *   "pressed"), an `aria-label`, and a `disabled` state.
 * - Keyboard operable for free: it's a native <button>, so Space/Enter toggle it, and it
 *   shows a focus-visible ring.
 * - Smooth Tailwind transitions on both the background colour and the sliding knob.
 */
export function ToggleSwitch({ checked, onChange, disabled = false, label, id }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-km-bg disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? 'bg-km-accent' : 'bg-white/20'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute left-0.5 inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-300 ease-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}
