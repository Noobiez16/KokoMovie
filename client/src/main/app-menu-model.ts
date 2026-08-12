import type { AppLocale } from './locales'
import { normalizeLocale } from './locales'

export interface ApplicationMenuItem {
  label?: string
  role?: string
  type?: 'separator'
  accelerator?: string
  submenu?: ApplicationMenuItem[]
  click?: () => void
}

interface MenuActions {
  documentation?: () => void
  feedback?: () => void
}

const LABELS: Record<AppLocale, {
  file: string; edit: string; view: string; window: string; help: string
  documentation: string; feedback: string
}> = {
  'en-US': { file: 'File', edit: 'Edit', view: 'View', window: 'Window', help: 'Help', documentation: 'Documentation', feedback: 'Send Feedback…' },
  'es-ES': { file: 'Archivo', edit: 'Editar', view: 'Ver', window: 'Ventana', help: 'Ayuda', documentation: 'Documentación', feedback: 'Enviar comentarios…' },
  'fr-FR': { file: 'Fichier', edit: 'Édition', view: 'Affichage', window: 'Fenêtre', help: 'Aide', documentation: 'Documentation', feedback: 'Envoyer des commentaires…' },
}

export function buildApplicationMenuTemplate(
  localeValue: unknown,
  platform: NodeJS.Platform,
  actions: MenuActions = {},
): ApplicationMenuItem[] {
  const labels = LABELS[normalizeLocale(localeValue)]
  return [
    ...(platform === 'darwin'
      ? [{ label: 'KokoMovie', submenu: [{ role: 'about' }, { type: 'separator' as const }, { role: 'quit' }] }]
      : []),
    { label: labels.file, submenu: [{ role: platform === 'darwin' ? 'close' : 'quit' }] },
    {
      label: labels.edit,
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: labels.view,
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' },
      ],
    },
    {
      label: labels.window,
      submenu: [
        { role: 'minimize' }, { role: 'zoom' },
        ...(platform === 'darwin' ? [{ role: 'front' }] : [{ role: 'close' }]),
      ],
    },
    {
      label: labels.help,
      role: 'help',
      submenu: [
        { label: labels.documentation, accelerator: 'F1', click: actions.documentation },
        { label: labels.feedback, click: actions.feedback },
      ],
    },
  ]
}
