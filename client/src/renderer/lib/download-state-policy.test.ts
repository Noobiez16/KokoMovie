import { describe, expect, it } from 'vitest'
import {
  canTransitionDownload,
  contiguousRecoverablePrefix,
  recoverInterruptedStatus,
} from '../../main/download-state-policy'

describe('download state and recovery policy', () => {
  it('requeues only interrupted active transfers', () => {
    expect(recoverInterruptedStatus('downloading')).toBe('pending')
    expect(recoverInterruptedStatus('completed')).toBe('completed')
    expect(recoverInterruptedStatus('paused')).toBe('paused')
  })

  it('allows explicit lifecycle transitions and rejects completed resurrection', () => {
    expect(canTransitionDownload('pending', 'downloading')).toBe(true)
    expect(canTransitionDownload('downloading', 'paused')).toBe(true)
    expect(canTransitionDownload('error', 'pending')).toBe(true)
    expect(canTransitionDownload('completed', 'pending')).toBe(false)
  })

  it('resumes only the contiguous valid encrypted segment prefix', () => {
    const sizes = new Map([[0, 100], [1, 200], [3, 300]])
    expect(contiguousRecoverablePrefix(sizes, 5)).toEqual({ completed: 2, encryptedBytes: 300 })
    expect(contiguousRecoverablePrefix(new Map([[0, 28], [1, 100]]), 2))
      .toEqual({ completed: 0, encryptedBytes: 0 })
  })
})
