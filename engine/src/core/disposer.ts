/**
 * Resource ownership.
 *
 * Rationale: `removeEventListener` is only safe when the *same* function
 * reference, the *same* capture flag and the *same* target are supplied. Any
 * helper that forgets one of the three leaks silently and can only be found by
 * profiling. Every engine-owned resource therefore goes through a `Disposer`,
 * which stores the exact remover closure produced at bind time.
 *
 * The counters exist so the test suite can assert "0 listeners after destroy"
 * instead of trusting the code by inspection.
 */

export interface DiagnosticsCounters {
  listenersBound: number
  listenersReleased: number
  timeoutsCreated: number
  timeoutsCleared: number
  framesScheduled: number
  stylesInstalled: number
  stylesRestored: number
  disposedScopes: number
}

export const counters: DiagnosticsCounters = {
  listenersBound: 0,
  listenersReleased: 0,
  timeoutsCreated: 0,
  timeoutsCleared: 0,
  framesScheduled: 0,
  stylesInstalled: 0,
  stylesRestored: 0,
  disposedScopes: 0
}

export function resetCounters(): void {
  counters.listenersBound = 0
  counters.listenersReleased = 0
  counters.timeoutsCreated = 0
  counters.timeoutsCleared = 0
  counters.framesScheduled = 0
  counters.stylesInstalled = 0
  counters.stylesRestored = 0
  counters.disposedScopes = 0
}

export function liveListenerCount(): number {
  return counters.listenersBound - counters.listenersReleased
}

type Target = EventTarget

interface StyleRecord {
  el: HTMLElement
  prop: string
  previous: string
  priority: string
}

export class Disposer {
  private closers: Array<() => void> = []
  private children: Disposer[] = []
  private _disposed = false
  readonly label: string

  constructor(label = 'scope') {
    this.label = label
  }

  get disposed(): boolean {
    return this._disposed
  }

  /** Number of live closures — used by leak assertions. */
  get size(): number {
    return this.closers.length
  }

  /**
   * Bind a listener. `options` is passed to both add and remove; the browser
   * only compares the capture flag, but passing the identical object is the only
   * provably symmetric form.
   */
  listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    handler: (event: WindowEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean
  ): () => void
  listen<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    handler: (event: DocumentEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean
  ): () => void
  listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean
  ): () => void
  listen(target: Target, type: string, handler: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean): () => void
  listen(
    target: Target,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): () => void {
    if (this._disposed) return () => {}
    target.addEventListener(type, handler, options)
    counters.listenersBound++

    let removed = false
    const remove = () => {
      if (removed) return
      removed = true
      target.removeEventListener(type, handler, options)
      counters.listenersReleased++
      const i = this.closers.indexOf(remove)
      if (i >= 0) this.closers.splice(i, 1)
    }
    this.closers.push(remove)
    return remove
  }

  /** A timer that is guaranteed to be cleared on dispose. */
  timeout(fn: () => void, ms: number): () => void {
    if (this._disposed) return () => {}
    counters.timeoutsCreated++
    const id = setTimeout(() => {
      counters.timeoutsCleared++
      this.closers = this.closers.filter((c) => c !== clear)
      fn()
    }, ms)
    let cleared = false
    const clear = () => {
      if (cleared) return
      cleared = true
      clearTimeout(id)
      counters.timeoutsCleared++
      const i = this.closers.indexOf(clear)
      if (i >= 0) this.closers.splice(i, 1)
    }
    this.closers.push(clear)
    return clear
  }

  interval(fn: () => void, ms: number): () => void {
    if (this._disposed) return () => {}
    const id = setInterval(fn, ms)
    let cleared = false
    const clear = () => {
      if (cleared) return
      cleared = true
      clearInterval(id)
      const i = this.closers.indexOf(clear)
      if (i >= 0) this.closers.splice(i, 1)
    }
    this.closers.push(clear)
    return clear
  }

  /** Register any teardown function (observer.disconnect, abort, …). */
  onDispose(fn: () => void): void {
    if (this._disposed) {
      fn()
      return
    }
    this.closers.push(fn)
  }

  /** Own a child scope: disposing the parent disposes the child. */
  adopt<T extends { destroy(): void }>(child: T): T {
    this.children.push(child as unknown as Disposer)
    if (this._disposed) child.destroy()
    return child
  }

  /**
   * Install inline styles and remember the exact previous value *and* priority,
   * so `dispose()` restores author CSS instead of stamping an empty string over
   * it. Blindly assigning `style.touchAction = ''` is how a page ends up with a
   * permanently broken scroll container after a component unmounts.
   */
  style(el: HTMLElement, prop: string, value: string, priority = ''): void {
    const record: StyleRecord = {
      el,
      prop,
      previous: el.style.getPropertyValue(prop),
      priority: el.style.getPropertyPriority(prop)
    }
    el.style.setProperty(prop, value, priority)
    counters.stylesInstalled++
    this.closers.push(() => {
      if (record.previous) el.style.setProperty(prop, record.previous, record.priority)
      else el.style.removeProperty(prop)
      counters.stylesRestored++
    })
  }

  /** Batch style install with a single restore closure. */
  styles(el: HTMLElement, map: Record<string, string>): void {
    for (const [prop, value] of Object.entries(map)) this.style(el, prop, value)
  }

  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    counters.disposedScopes++

    // Reverse order: later resources may depend on earlier ones.
    for (let i = this.closers.length - 1; i >= 0; i--) {
      try {
        this.closers[i]()
      } catch {
        /* teardown must never throw into the caller's stack */
      }
    }
    this.closers.length = 0

    for (const child of this.children) {
      try {
        child.dispose()
      } catch {
        /* same */
      }
    }
    this.children.length = 0
  }
}

/**
 * Small helper for "call every subscriber, stop if one throws" semantics.
 * A throwing subscriber must not prevent the others from being notified, and it
 * must not propagate into an event handler (which would surface as a console
 * error the library cannot attribute).
 */
export function safeNotify<T>(subscribers: Set<(v: T) => void>, value: T): void {
  for (const fn of Array.from(subscribers)) {
    try {
      fn(value)
    } catch (error) {
      if (typeof console !== 'undefined') console.error('[kinetic] subscriber failed', error)
    }
  }
}
