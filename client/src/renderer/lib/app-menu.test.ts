import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildApplicationMenuTemplate, type ApplicationMenuItem } from '../../main/app-menu-model'

function topLevel(template: ApplicationMenuItem[], label: string): ApplicationMenuItem {
  const item = template.find((candidate) => candidate.label === label)
  if (!item) throw new Error(`Missing menu: ${label}`)
  return item
}

describe('application menu model', () => {
  it.each([
    ['en-US' as const, 'View'],
    ['es-ES' as const, 'Ver'],
    ['fr-FR' as const, 'Affichage'],
  ])('always exposes Developer Tools in %s', (locale, viewLabel) => {
    const template = buildApplicationMenuTemplate(locale, 'win32')
    const view = topLevel(template, viewLabel)

    expect(view.submenu?.some((item) => item.role === 'toggleDevTools')).toBe(true)
    expect(view.submenu?.map((item) => item.role).filter(Boolean)).toEqual(expect.arrayContaining([
      'reload', 'forceReload', 'toggleDevTools', 'resetZoom', 'zoomIn', 'zoomOut', 'togglefullscreen',
    ]))
  })

  it('localizes KokoMovie-owned labels without changing native roles', () => {
    const spanish = buildApplicationMenuTemplate('es-ES', 'darwin')
    expect(spanish.map((item) => item.label)).toEqual(['KokoMovie', 'Archivo', 'Editar', 'Ver', 'Ventana', 'Ayuda'])
    expect(topLevel(spanish, 'Ayuda').submenu?.map((item) => item.label).filter(Boolean)).toEqual([
      'Documentación', 'Enviar comentarios…',
    ])
    expect(topLevel(spanish, 'Archivo').submenu?.[0]?.role).toBe('close')
  })

  it('contains no build-mode gate around Developer Tools', () => {
    const source = readFileSync(new URL('../../main/app-menu.ts', import.meta.url), 'utf8')
    expect(source).not.toContain("NODE_ENV")
    expect(source).not.toContain("development")
  })
})
