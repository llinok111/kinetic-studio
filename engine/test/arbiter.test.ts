import { describe, expect, it, vi } from 'vitest'
import { Arbiter, PRIORITY } from '../src/interaction/arbiter'

describe('Arbiter', () => {
  it('grants an unclaimed pointer', () => {
    const a = new Arbiter()
    expect(a.claim(1, 'card', PRIORITY.drag)).toBe(true)
    expect(a.ownerOf(1)).toBe('card')
  })

  it('denies a lower-priority second claimant', () => {
    const a = new Arbiter()
    a.claim(1, 'card', PRIORITY.drag)
    expect(a.claim(1, 'scroller', PRIORITY.scroll)).toBe(false)
    expect(a.ownerOf(1)).toBe('card')
  })

  it('preempts a lower-priority owner and notifies it', () => {
    const a = new Arbiter()
    const revoked = vi.fn()
    a.onRevoke('card', revoked)
    a.claim(1, 'card', PRIORITY.drag)
    expect(a.claim(1, 'modal', PRIORITY.modal)).toBe(true)
    expect(a.ownerOf(1)).toBe('modal')
    expect(revoked).toHaveBeenCalledTimes(1)
    expect(revoked.mock.calls[0][0].owner).toBe('card')
  })

  it('renews for the same owner without revoking', () => {
    const a = new Arbiter()
    const revoked = vi.fn()
    a.onRevoke('card', revoked)
    a.claim(1, 'card', PRIORITY.drag)
    expect(a.claim(1, 'card', PRIORITY.drag)).toBe(true)
    expect(revoked).not.toHaveBeenCalled()
  })

  it('refuses beyond maxPointers', () => {
    const a = new Arbiter(1)
    expect(a.claim(1, 'card', PRIORITY.drag)).toBe(true)
    expect(a.claim(2, 'card2', PRIORITY.drag)).toBe(false)
    a.release(1)
    expect(a.claim(2, 'card2', PRIORITY.drag)).toBe(true)
  })

  it('releases only for the matching owner', () => {
    const a = new Arbiter()
    a.claim(1, 'card', PRIORITY.drag)
    a.release(1, 'other')
    expect(a.ownerOf(1)).toBe('card')
    a.release(1, 'card')
    expect(a.ownerOf(1)).toBeNull()
  })

  it('releases everything for one owner', () => {
    const a = new Arbiter(4)
    a.claim(1, 'card', PRIORITY.drag)
    a.claim(2, 'card', PRIORITY.drag)
    a.claim(3, 'scroller', PRIORITY.scroll)
    a.releaseAll('card')
    expect(a.activePointers).toBe(1)
    expect(a.ownerOf(3)).toBe('scroller')
  })

  it('survives a throwing revoke handler', () => {
    const a = new Arbiter()
    a.onRevoke('card', () => {
      throw new Error('boom')
    })
    a.claim(1, 'card', PRIORITY.drag)
    expect(() => a.claim(1, 'modal', PRIORITY.modal)).not.toThrow()
  })
})
