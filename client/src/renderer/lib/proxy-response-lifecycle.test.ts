import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { bindProxyResponseLifecycle } from '../../main/providers/proxy-response-lifecycle'

describe('proxy response lifecycle', () => {
  it('does not treat a normal incoming request close as player cancellation', () => {
    const req = new EventEmitter()
    const res = Object.assign(new EventEmitter(), { writableEnded: false })
    const abort = vi.fn()
    bindProxyResponseLifecycle(req, res, abort)

    req.emit('close')
    expect(abort).not.toHaveBeenCalled()
  })

  it('aborts on a request abort or an unfinished response close', () => {
    const req = new EventEmitter()
    const res = Object.assign(new EventEmitter(), { writableEnded: false })
    const abort = vi.fn()
    bindProxyResponseLifecycle(req, res, abort)

    req.emit('aborted')
    res.emit('close')
    expect(abort).toHaveBeenCalledTimes(1)
  })

  it('does not abort after the response finished normally', () => {
    const req = new EventEmitter()
    const res = Object.assign(new EventEmitter(), { writableEnded: true })
    const abort = vi.fn()
    bindProxyResponseLifecycle(req, res, abort)

    res.emit('close')
    expect(abort).not.toHaveBeenCalled()
  })
})
