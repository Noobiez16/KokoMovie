import { describe, expect, it } from 'vitest'
import { redactDiagnosticText } from '../../main/diagnostics'

describe('diagnostic privacy boundary', () => {
  it('removes URLs, API credentials, content identifiers, and local paths', () => {
    const redacted = redactDiagnosticText(
      'api_key=super-secret https://provider.example/watch/tt1234567 content=tt7654321 /home/alice/Videos/movie.mp4 C:\\Users\\Alice\\movie.mp4',
    )

    expect(redacted).not.toContain('super-secret')
    expect(redacted).not.toContain('provider.example')
    expect(redacted).not.toContain('tt1234567')
    expect(redacted).not.toContain('/home/alice')
    expect(redacted).not.toContain('C:\\Users')
    expect(redacted).toContain('[secret]')
    expect(redacted).toContain('[url]')
    expect(redacted).toContain('[content-id]')
    expect(redacted).toContain('[path]')
  })

  it('bounds every diagnostic detail', () => {
    expect(redactDiagnosticText('x'.repeat(1000))).toHaveLength(500)
  })
})
