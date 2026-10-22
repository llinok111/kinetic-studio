import { describe, expect, it, vi } from 'vitest'
import { InteractionMachine } from '../src/interaction/machine'

describe('InteractionMachine', () => {
  it('starts idle', () => {
    const m = new InteractionMachine()
    expect(m.phase).toBe('idle')
    expect(m.is('idle')).toBe(true)
  })

  it('walks the happy path of a drag with momentum', () => {
    const m = new InteractionMachine()
    expect(m.to('press', 'down')).toBe(true)
    expect(m.to('drag', 'threshold')).toBe(true)
    expect(m.to('inertia', 'fling')).toBe(true)
    expect(m.to('settle', 'snap')).toBe(true)
    expect(m.to('idle', 'done')).toBe(true)
    expect(m.history.map((h) => h.to)).toEqual(['press', 'drag', 'inertia', 'settle', 'idle'])
  })

  it('rejects an impossible transition and counts it', () => {
    const m = new InteractionMachine()
    m.to('hover', 'enter')
    // Hover cannot become inertia: nothing was thrown.
    expect(m.to('inertia', 'impossible')).toBe(false)
    expect(m.phase).toBe('hover')
    expect(m.rejectedTransitions).toBe(1)
  })

  it('treats a same-phase transition as a refresh, not a rejection', () => {
    const m = new InteractionMachine()
    m.to('drag', 'first')
    expect(m.to('drag', 'again')).toBe(true)
    expect(m.rejectedTransitions).toBe(0)
    expect(m.reason).toBe('again')
  })

  it('guards transitions with from()', () => {
    const m = new InteractionMachine()
    expect(m.from('drag', 'inertia', 'not-dragging')).toBe(false)
    expect(m.rejectedTransitions).toBe(1)
    m.to('press', 'down')
    m.to('drag', 'moved')
    expect(m.from(['press', 'drag'], 'inertia', 'ok')).toBe(true)
    expect(m.phase).toBe('inertia')
  })

  it('notifies subscribers with duration and reason', () => {
    let clock = 0
    const m = new InteractionMachine(() => clock)
    const seen: string[] = []
    m.on((c) => seen.push(`${c.from}->${c.to}:${c.reason}`))
    clock = 40
    m.to('press', 'down')
    clock = 130
    m.to('drag', 'moved')
    expect(seen).toEqual(['idle->press:down', 'press->drag:moved'])
    expect(m.history[1].duration).toBe(90)
  })

  it('unsubscribes', () => {
    const m = new InteractionMachine()
    const fn = vi.fn()
    const off = m.on(fn)
    m.to('press', 'down')
    off()
    m.to('drag', 'moved')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('caps history', () => {
    const m = new InteractionMachine()
    for (let i = 0; i < 200; i++) {
      m.to('press', 'down')
      m.to('idle', 'up')
    }
    expect(m.history.length).toBeLessThanOrEqual(48)
  })

  it('resets', () => {
    const m = new InteractionMachine()
    m.to('press', 'down')
    m.to('drag', 'moved')
    m.reset()
    expect(m.phase).toBe('idle')
    expect(m.history.length).toBe(0)
    expect(m.rejectedTransitions).toBe(0)
  })

  it('allows regaining a drag from inertia', () => {
    // Re-grabbing a card mid-fling is a normal interaction, not a bug.
    const m = new InteractionMachine()
    m.to('press', 'down')
    m.to('drag', 'moved')
    m.to('inertia', 'fling')
    expect(m.to('drag', 'regrab')).toBe(true)
  })

  it('allows cancel from every transient phase', () => {
    for (const setup of [
      () => ['press'],
      () => ['press', 'drag'],
      () => ['press', 'drag', 'inertia'],
      () => ['press', 'drag', 'settle']
    ]) {
      const m = new InteractionMachine()
      for (const phase of setup()) m.to(phase as never, 'setup')
      expect(m.to('cancelled', 'pointercancel')).toBe(true)
      expect(m.to('idle', 'cleaned')).toBe(true)
    }
  })
})
