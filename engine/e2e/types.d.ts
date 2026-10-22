export {}

declare global {
  interface Window {
    __kinetic: {
      engine: any
      probe: { live: number }
      frameLoop: { fps: number; tier: string; running: boolean; size: number }
      drag: any
      magnets: Map<Element, any>
    }
  }
}
