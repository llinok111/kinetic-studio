"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// engine/src/index.ts
var index_exports = {};
__export(index_exports, {
  Arbiter: () => Arbiter,
  Decay: () => Decay,
  Disposer: () => Disposer,
  FrameLoop: () => FrameLoop,
  InteractionMachine: () => InteractionMachine,
  Kinetic: () => Kinetic,
  MotionController: () => MotionController,
  PRIORITY: () => PRIORITY,
  SPRING_PRESETS: () => SPRING_PRESETS,
  Spring: () => Spring,
  clampMomentum: () => clampMomentum,
  counters: () => counters,
  createKinetic: () => createKinetic,
  default: () => index_default,
  frameLoop: () => frameLoop,
  liveListenerCount: () => liveListenerCount,
  momentumDistance: () => momentumDistance,
  readCapabilities: () => readCapabilities,
  resetCounters: () => resetCounters,
  rubberbandPosition: () => rubberbandPosition
});
module.exports = __toCommonJS(index_exports);

// engine/src/core/capability.ts
var hasWindow = () => typeof window !== "undefined" && typeof document !== "undefined";
var matches = (query) => {
  if (!hasWindow() || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
};
var QUERIES = {
  fine: "(pointer: fine)",
  coarse: "(pointer: coarse)",
  hover: "(hover: hover)",
  reduce: "(prefers-reduced-motion: reduce)"
};
function readCapabilities() {
  var _a;
  if (!hasWindow()) {
    return {
      finePointer: false,
      coarsePointer: false,
      hover: false,
      touch: false,
      maxTouchPoints: 0,
      reducedMotion: false,
      devicePixelRatio: 1,
      cores: null,
      saveData: false
    };
  }
  const nav = navigator;
  const maxTouchPoints = typeof nav.maxTouchPoints === "number" ? nav.maxTouchPoints : 0;
  return {
    finePointer: matches(QUERIES.fine),
    coarsePointer: matches(QUERIES.coarse),
    hover: matches(QUERIES.hover),
    touch: maxTouchPoints > 0,
    maxTouchPoints,
    reducedMotion: matches(QUERIES.reduce),
    devicePixelRatio: window.devicePixelRatio || 1,
    cores: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
    saveData: ((_a = nav.connection) == null ? void 0 : _a.saveData) === true
  };
}
function onMediaChange(query, cb) {
  if (!hasWindow() || typeof window.matchMedia !== "function") return () => {
  };
  let mql;
  try {
    mql = window.matchMedia(query);
  } catch {
    return () => {
    };
  }
  const handler = (event) => cb(event.matches);
  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", handler);
    return () => {
      var _a;
      return (_a = mql.removeEventListener) == null ? void 0 : _a.call(mql, "change", handler);
    };
  }
  if (typeof mql.addListener === "function") {
    mql.addListener(handler);
    return () => {
      var _a;
      return (_a = mql.removeListener) == null ? void 0 : _a.call(mql, handler);
    };
  }
  return () => {
  };
}
function watchCapabilities(cb) {
  const offs = [
    onMediaChange(QUERIES.fine, () => cb(readCapabilities())),
    onMediaChange(QUERIES.coarse, () => cb(readCapabilities())),
    onMediaChange(QUERIES.hover, () => cb(readCapabilities())),
    onMediaChange(QUERIES.reduce, () => cb(readCapabilities()))
  ];
  return () => {
    for (const off of offs) off();
  };
}

// engine/src/core/disposer.ts
var counters = {
  listenersBound: 0,
  listenersReleased: 0,
  timeoutsCreated: 0,
  timeoutsCleared: 0,
  framesScheduled: 0,
  stylesInstalled: 0,
  stylesRestored: 0,
  disposedScopes: 0
};
function resetCounters() {
  counters.listenersBound = 0;
  counters.listenersReleased = 0;
  counters.timeoutsCreated = 0;
  counters.timeoutsCleared = 0;
  counters.framesScheduled = 0;
  counters.stylesInstalled = 0;
  counters.stylesRestored = 0;
  counters.disposedScopes = 0;
}
function liveListenerCount() {
  return counters.listenersBound - counters.listenersReleased;
}
var Disposer = class {
  constructor(label = "scope") {
    this.closers = [];
    this.children = [];
    this._disposed = false;
    this.label = label;
  }
  get disposed() {
    return this._disposed;
  }
  /** Number of live closures — used by leak assertions. */
  get size() {
    return this.closers.length;
  }
  listen(target, type, handler, options) {
    if (this._disposed) return () => {
    };
    target.addEventListener(type, handler, options);
    counters.listenersBound++;
    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      target.removeEventListener(type, handler, options);
      counters.listenersReleased++;
      const i = this.closers.indexOf(remove);
      if (i >= 0) this.closers.splice(i, 1);
    };
    this.closers.push(remove);
    return remove;
  }
  /** A timer that is guaranteed to be cleared on dispose. */
  timeout(fn, ms) {
    if (this._disposed) return () => {
    };
    counters.timeoutsCreated++;
    const id = setTimeout(() => {
      counters.timeoutsCleared++;
      this.closers = this.closers.filter((c) => c !== clear);
      fn();
    }, ms);
    let cleared = false;
    const clear = () => {
      if (cleared) return;
      cleared = true;
      clearTimeout(id);
      counters.timeoutsCleared++;
      const i = this.closers.indexOf(clear);
      if (i >= 0) this.closers.splice(i, 1);
    };
    this.closers.push(clear);
    return clear;
  }
  interval(fn, ms) {
    if (this._disposed) return () => {
    };
    const id = setInterval(fn, ms);
    let cleared = false;
    const clear = () => {
      if (cleared) return;
      cleared = true;
      clearInterval(id);
      const i = this.closers.indexOf(clear);
      if (i >= 0) this.closers.splice(i, 1);
    };
    this.closers.push(clear);
    return clear;
  }
  /** Register any teardown function (observer.disconnect, abort, …). */
  onDispose(fn) {
    if (this._disposed) {
      fn();
      return;
    }
    this.closers.push(fn);
  }
  /** Own a child scope: disposing the parent disposes the child. */
  adopt(child) {
    this.children.push(child);
    if (this._disposed) child.destroy();
    return child;
  }
  /**
   * Install inline styles and remember the exact previous value *and* priority,
   * so `dispose()` restores author CSS instead of stamping an empty string over
   * it. Blindly assigning `style.touchAction = ''` is how a page ends up with a
   * permanently broken scroll container after a component unmounts.
   */
  style(el, prop, value, priority = "") {
    const record = {
      el,
      prop,
      previous: el.style.getPropertyValue(prop),
      priority: el.style.getPropertyPriority(prop)
    };
    el.style.setProperty(prop, value, priority);
    counters.stylesInstalled++;
    this.closers.push(() => {
      if (record.previous) el.style.setProperty(prop, record.previous, record.priority);
      else el.style.removeProperty(prop);
      counters.stylesRestored++;
    });
  }
  /** Batch style install with a single restore closure. */
  styles(el, map) {
    for (const [prop, value] of Object.entries(map)) this.style(el, prop, value);
  }
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    counters.disposedScopes++;
    for (let i = this.closers.length - 1; i >= 0; i--) {
      try {
        this.closers[i]();
      } catch {
      }
    }
    this.closers.length = 0;
    for (const child of this.children) {
      try {
        child.dispose();
      } catch {
      }
    }
    this.children.length = 0;
  }
};
function safeNotify(subscribers, value) {
  for (const fn of Array.from(subscribers)) {
    try {
      fn(value);
    } catch (error) {
      if (typeof console !== "undefined") console.error("[kinetic] subscriber failed", error);
    }
  }
}

// engine/src/core/frame-loop.ts
var MAX_DT = 64;
var HIGH_FPS = 52;
var MID_FPS = 34;
var DOWNGRADE_FRAMES = 18;
var UPGRADE_FRAMES = 90;
var TIER_NAME = ["low", "mid", "high"];
var FrameLoop = class {
  constructor() {
    this.entries = [];
    this.nextId = 1;
    this.rafId = null;
    this.last = 0;
    this._fps = 60;
    this._frame = 0;
    this.started = false;
    this.tierLevel = 2;
    this.overBudget = 0;
    this.underBudget = 0;
    this.qualityListeners = /* @__PURE__ */ new Set();
    this.visibilityBound = false;
    this.forcedTier = null;
  }
  get fps() {
    return this._fps;
  }
  get frame() {
    return this._frame;
  }
  get tier() {
    var _a;
    return (_a = this.forcedTier) != null ? _a : TIER_NAME[this.tierLevel];
  }
  get running() {
    return this.started;
  }
  get size() {
    return this.entries.length;
  }
  /**
   * Subscribe. Lower numbers run first; effects that write to the DOM should use
   * a higher priority than effects that only measure it.
   * Returns an idempotent unsubscriber.
   */
  add(fn, priority = 0) {
    const entry = { id: this.nextId++, fn, priority };
    this.entries.push(entry);
    this.entries.sort((a, b) => a.priority - b.priority || a.id - b.id);
    this.start();
    return () => this.remove(entry.id);
  }
  remove(id) {
    const i = this.entries.findIndex((e) => e.id === id);
    if (i >= 0) this.entries.splice(i, 1);
    if (this.entries.length === 0) this.stop();
  }
  /** Force a tier (tests + the demo's degradation switch). `null` = adaptive. */
  forceTier(tier) {
    this.forcedTier = tier;
    if (tier) {
      this.tierLevel = TIER_NAME.indexOf(tier);
      safeNotify(this.qualityListeners, tier);
    }
  }
  onQualityChange(fn) {
    this.qualityListeners.add(fn);
    return () => this.qualityListeners.delete(fn);
  }
  start() {
    if (this.started || !hasWindow()) return;
    this.started = true;
    this.last = 0;
    this.bindVisibility();
    this.schedule();
  }
  stop() {
    if (this.rafId !== null && hasWindow()) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.started = false;
  }
  /**
   * Deterministic single frame. The test suite drives the loop with this so that
   * physics assertions never depend on wall-clock timing.
   */
  step(now2 = performance.now()) {
    const info = this.compute(now2);
    for (const entry of this.entries.slice()) {
      try {
        entry.fn(info);
      } catch (error) {
        console.error("[kinetic] frame subscriber failed", error);
      }
    }
    return info;
  }
  compute(now2) {
    const rawDt = this.last === 0 ? 16.6667 : now2 - this.last;
    this.last = now2;
    const dt = rawDt > 0 ? Math.min(rawDt, MAX_DT) : 16.6667;
    const dtSec = dt / 1e3;
    const instant = dt > 0 ? 1e3 / dt : 60;
    this._fps = this._fps * 0.88 + instant * 0.12;
    this._frame++;
    this.adapt(rawDt, dt);
    return { time: now2, dt, dtSec, fps: this._fps, frame: this._frame, tier: this.tier };
  }
  /**
   * Hysteresis matters more than the thresholds: without it a page sitting on a
   * boundary flips tier every frame, and every flip re-allocates buffers in the
   * trail renderer. Downgrade fast (18 frames), upgrade slowly (90 frames).
   */
  adapt(rawDt, clampedDt) {
    if (this.forcedTier) return;
    const usable = rawDt <= MAX_DT ? rawDt : clampedDt;
    const fps = 1e3 / usable;
    const target = fps >= HIGH_FPS ? 2 : fps >= MID_FPS ? 1 : 0;
    if (target < this.tierLevel) {
      this.overBudget++;
      this.underBudget = 0;
      if (this.overBudget >= DOWNGRADE_FRAMES && this.tierLevel > target) {
        this.tierLevel--;
        this.overBudget = 0;
        safeNotify(this.qualityListeners, this.tier);
      }
    } else if (target > this.tierLevel) {
      this.underBudget++;
      this.overBudget = 0;
      if (this.underBudget >= UPGRADE_FRAMES && this.tierLevel < target) {
        this.tierLevel++;
        this.underBudget = 0;
        safeNotify(this.qualityListeners, this.tier);
      }
    } else {
      this.overBudget = 0;
      this.underBudget = 0;
    }
  }
  schedule() {
    if (!hasWindow()) return;
    this.rafId = requestAnimationFrame((now2) => {
      this.rafId = null;
      counters.framesScheduled++;
      if (!this.started) return;
      this.step(now2);
      this.schedule();
    });
  }
  /**
   * A hidden tab stops rAF entirely; on return the first timestamp is far in the
   * future. Resetting `last` here (rather than relying on the dt clamp alone)
   * also prevents the EMA from being poisoned by a 20-second "frame".
   */
  bindVisibility() {
    if (this.visibilityBound || !hasWindow()) return;
    this.visibilityBound = true;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.stop();
      } else if (this.entries.length > 0) {
        this.last = 0;
        this.start();
      }
    });
  }
};
var frameLoop = new FrameLoop();

// engine/src/core/motion.ts
var FULL = {
  durationScale: 1,
  allowInertia: true,
  allowMagnetism: true,
  allowTrail: true,
  allowOverscrollRelease: true,
  snapImmediately: false
};
var REDUCED = {
  durationScale: 0,
  allowInertia: false,
  allowMagnetism: false,
  allowTrail: false,
  // Overscroll *resistance* is still direct manipulation, but the release
  // animation is not — the element snaps back on the same frame.
  allowOverscrollRelease: false,
  snapImmediately: true
};
var MotionController = class {
  constructor(preference = "auto") {
    this.systemReduced = false;
    this.listeners = /* @__PURE__ */ new Set();
    this.offMedia = null;
    this.preference = preference;
    this.systemReduced = hasWindow() ? safeMatches() : false;
    this._policy = this.resolve();
    if (preference === "auto") this.bind();
  }
  get policy() {
    return this._policy;
  }
  get resolved() {
    return this._policy.reduced;
  }
  /** `auto` | `reduce` | `full`. Setting a value unbinds the media listener. */
  set(preference) {
    if (preference === this.preference) return;
    this.preference = preference;
    if (preference === "auto") this.bind();
    else this.unbind();
    this.refresh();
  }
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  /**
   * Engines call this instead of branching on `reduced` everywhere: an animation
   * that is allowed in full mode collapses to 0 ms in reduced mode without the
   * caller needing to know which mode it is in.
   */
  duration(ms) {
    return this._policy.reduced ? 0 : ms;
  }
  destroy() {
    this.unbind();
    this.listeners.clear();
  }
  bind() {
    if (this.offMedia) return;
    this.offMedia = onMediaChange(QUERIES.reduce, (isMatch) => {
      this.systemReduced = isMatch;
      this.refresh();
    });
  }
  unbind() {
    var _a;
    (_a = this.offMedia) == null ? void 0 : _a.call(this);
    this.offMedia = null;
  }
  refresh() {
    const next = this.resolve();
    const changed = next.reduced !== this._policy.reduced || next.allowInertia !== this._policy.allowInertia || next.allowMagnetism !== this._policy.allowMagnetism || next.allowTrail !== this._policy.allowTrail;
    this._policy = next;
    if (changed) safeNotify(this.listeners, next);
  }
  resolve() {
    const reduced = this.preference === "reduce" || this.preference === "auto" && this.systemReduced;
    return { reduced, ...reduced ? REDUCED : FULL };
  }
};
function safeMatches() {
  try {
    return window.matchMedia(QUERIES.reduce).matches;
  } catch {
    return false;
  }
}

// engine/src/interaction/arbiter.ts
var PRIORITY = {
  hover: 0,
  scroll: 10,
  drag: 20,
  gesture: 30,
  modal: 40
};
var Arbiter = class {
  constructor(maxPointers = 2) {
    this.claims = /* @__PURE__ */ new Map();
    this.revokers = /* @__PURE__ */ new Map();
    this._maxPointers = maxPointers;
  }
  get maxPointers() {
    return this._maxPointers;
  }
  setMaxPointers(n) {
    this._maxPointers = Math.max(1, Math.floor(n));
  }
  get activePointers() {
    return this.claims.size;
  }
  ownerOf(pointerId2) {
    var _a, _b;
    return (_b = (_a = this.claims.get(pointerId2)) == null ? void 0 : _a.owner) != null ? _b : null;
  }
  isOwner(pointerId2, owner) {
    var _a;
    return ((_a = this.claims.get(pointerId2)) == null ? void 0 : _a.owner) === owner;
  }
  claim(pointerId2, owner, priority) {
    var _a;
    const existing = this.claims.get(pointerId2);
    if (!existing) {
      if (this.claims.size >= this._maxPointers) return false;
      this.claims.set(pointerId2, { pointerId: pointerId2, owner, priority, since: now() });
      return true;
    }
    if (existing.owner === owner) {
      existing.priority = Math.max(existing.priority, priority);
      return true;
    }
    if (priority > existing.priority) {
      const previous = existing.owner;
      const claim = { ...existing };
      this.claims.set(pointerId2, { pointerId: pointerId2, owner, priority, since: now() });
      const revoke = this.revokers.get(previous);
      if (revoke) {
        try {
          revoke(claim);
        } catch {
        }
      }
    }
    return ((_a = this.claims.get(pointerId2)) == null ? void 0 : _a.owner) === owner;
  }
  release(pointerId2, owner) {
    const existing = this.claims.get(pointerId2);
    if (!existing) return;
    if (owner && existing.owner !== owner) return;
    this.claims.delete(pointerId2);
  }
  releaseAll(owner) {
    if (!owner) {
      this.claims.clear();
      return;
    }
    for (const [id, claim] of Array.from(this.claims)) {
      if (claim.owner === owner) this.claims.delete(id);
    }
  }
  onRevoke(owner, handler) {
    this.revokers.set(owner, handler);
    return () => {
      if (this.revokers.get(owner) === handler) this.revokers.delete(owner);
    };
  }
  snapshot() {
    return Array.from(this.claims.values());
  }
};
function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

// engine/src/core/context.ts
var EngineContext = class {
  constructor(options = {}) {
    this.scope = new Disposer("engine");
    this.capsListeners = /* @__PURE__ */ new Set();
    var _a;
    this.debug = options.debug === true;
    this.caps = readCapabilities();
    this.motion = new MotionController((_a = options.motion) != null ? _a : "auto");
    this.loop = frameLoop;
    this.arbiter = new Arbiter(Math.max(2, this.caps.maxTouchPoints || 2));
    if (options.quality && options.quality !== "auto") this.loop.forceTier(options.quality);
    this.scope.onDispose(() => this.motion.destroy());
    this.scope.onDispose(
      watchCapabilities((caps) => {
        Object.assign(this.caps, caps);
        for (const fn of Array.from(this.capsListeners)) {
          try {
            fn(caps);
          } catch {
          }
        }
      })
    );
  }
  get reduced() {
    return this.motion.policy.reduced;
  }
  /** True when the primary input can hover — gates every pointer-following effect. */
  get canHover() {
    return this.caps.hover && !this.caps.coarsePointer;
  }
  onCapsChange(fn) {
    this.capsListeners.add(fn);
    return () => this.capsListeners.delete(fn);
  }
};

// engine/src/core/motion-writer.ts
var INDIVIDUAL_TRANSFORMS = (() => {
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") return false;
  try {
    return CSS.supports("translate", "10px") && CSS.supports("scale", "1.5");
  } catch {
    return false;
  }
})();
var MotionWriter = class {
  constructor(el) {
    this.last = "";
    this.el = el;
    this.baseTransform = el.style.transform || "";
  }
  /** Returns true when a write actually happened (lets callers skip layout). */
  write(x, y, scale = 1) {
    const rounded = `${round(x)}px ${round(y)}px ${round(scale)}`;
    if (rounded === this.last) return false;
    this.last = rounded;
    if (INDIVIDUAL_TRANSFORMS) {
      this.el.style.translate = `${round(x)}px ${round(y)}px`;
      if (scale !== 1) this.el.style.scale = String(round(scale));
      else this.el.style.removeProperty("scale");
    } else {
      const prefix = `translate3d(${round(x)}px, ${round(y)}px, 0)`;
      const scalePart = scale !== 1 ? ` scale(${round(scale)})` : "";
      this.el.style.transform = `${prefix}${scalePart}${this.baseTransform ? ` ${this.baseTransform}` : ""}`;
    }
    return true;
  }
  reset() {
    this.last = "";
    if (INDIVIDUAL_TRANSFORMS) {
      this.el.style.removeProperty("translate");
      this.el.style.removeProperty("scale");
    } else if (this.baseTransform) {
      this.el.style.transform = this.baseTransform;
    } else {
      this.el.style.removeProperty("transform");
    }
  }
};
function round(v) {
  return Math.round(v * 100) / 100;
}

// engine/src/core/math.ts
var clamp = (v, min, max) => v < min ? min : v > max ? max : v;
var easeOutQuad = (t) => 1 - (1 - clamp(t, 0, 1)) ** 2;
var distance = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
var decayStep = (velocity, friction, dtSec) => velocity * Math.exp(-Math.max(0, friction) * dtSec);
var perMsToPerSec = (v) => v * 1e3;
var nearest = (value, points) => {
  let best = value;
  let bestD = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = Math.abs(points[i] - value);
    if (d < bestD) {
      bestD = d;
      best = points[i];
    }
  }
  return best;
};
var normalizeWheel = (delta, deltaMode, viewport, lineHeight = 16) => {
  if (deltaMode === 1) return delta * lineHeight;
  if (deltaMode === 2) return delta * viewport;
  return delta;
};
var sign = (v) => v > 0 ? 1 : v < 0 ? -1 : 0;

// engine/src/core/spring.ts
var MAX_SUBSTEP = 1 / 240;
var SPRING_PRESETS = {
  /** Follows the pointer closely, no visible lag. */
  tight: { stiffness: 420, damping: 32, mass: 1 },
  /** The default: a little overshoot on release. */
  balanced: { stiffness: 170, damping: 20, mass: 1 },
  /** Loose, long settle — used for the elastic-drag return. */
  loose: { stiffness: 90, damping: 16, mass: 1 },
  /** Critically damped-ish, used for scroll snapping. */
  crisp: { stiffness: 260, damping: 30, mass: 1 }
};
var Spring = class {
  constructor(value = 0, config = {}) {
    /** Guards against NaN propagating into a transform string. */
    this.poisoned = false;
    var _a, _b, _c;
    this.value = value;
    this.target = value;
    this.velocity = 0;
    const preset = SPRING_PRESETS.balanced;
    this.stiffness = (_a = config.stiffness) != null ? _a : preset.stiffness;
    this.damping = (_b = config.damping) != null ? _b : preset.damping;
    this.mass = (_c = config.mass) != null ? _c : preset.mass;
  }
  setTarget(target) {
    this.target = target;
  }
  /** Teleport: value and target move, velocity is zeroed. */
  jump(value) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.poisoned = false;
  }
  /** Inject momentum (px/s) without moving the value. */
  impulse(velocity) {
    this.velocity += velocity;
  }
  get settled() {
    return Math.abs(this.target - this.value) < 0.05 && Math.abs(this.velocity) < 0.05;
  }
  step(dtSec) {
    if (!(dtSec > 0)) return this.value;
    const total = Math.min(dtSec, 0.25);
    let remaining = total;
    while (remaining > 0) {
      const h = Math.min(remaining, MAX_SUBSTEP);
      const accel = (-this.stiffness * (this.value - this.target) - this.damping * this.velocity) / this.mass;
      this.velocity += accel * h;
      this.value += this.velocity * h;
      remaining -= h;
    }
    if (!Number.isFinite(this.value) || !Number.isFinite(this.velocity)) {
      if (!this.poisoned) this.poisoned = true;
      this.value = this.target;
      this.velocity = 0;
    }
    if (this.settled) {
      this.value = this.target;
      this.velocity = 0;
    }
    return this.value;
  }
};
var Decay = class {
  constructor(velocity, friction = 6) {
    this.travelled = 0;
    this.velocity = velocity;
    this.friction = Math.max(0.01, friction);
  }
  get done() {
    return Math.abs(this.velocity) < 2;
  }
  step(dtSec) {
    if (this.done) {
      this.velocity = 0;
      return 0;
    }
    const before = this.velocity;
    this.velocity = decayStep(this.velocity, this.friction, dtSec);
    const k = this.friction;
    const delta = (before - this.velocity) / k;
    this.travelled += delta;
    return delta;
  }
  get distance() {
    return this.travelled;
  }
};
function momentumDistance(velocity, friction) {
  return friction <= 0 ? 0 : velocity / friction;
}
function rubberbandPosition(position, min, max, constant = 0.15) {
  if (constant === 0) return clamp(position, min, max);
  if (position < min) {
    const overshoot = min - position;
    return min - overshoot * (max - min) * constant / (max - min + constant * overshoot);
  }
  if (position > max) {
    const overshoot = position - max;
    return max + overshoot * (max - min) * constant / (max - min + constant * overshoot);
  }
  return position;
}
function clampMomentum(position, velocity, min, max, friction) {
  const projected = position + momentumDistance(velocity, friction);
  return { position, velocity, hitsEdge: projected < min || projected > max };
}

// engine/src/interaction/machine.ts
var TRANSITIONS = {
  idle: ["hover", "press", "drag", "inertia", "settle", "blocked"],
  hover: ["press", "idle", "blocked"],
  press: ["drag", "idle", "hover", "cancelled"],
  drag: ["inertia", "settle", "cancelled", "idle"],
  inertia: ["settle", "drag", "idle", "cancelled"],
  settle: ["idle", "hover", "drag", "cancelled"],
  cancelled: ["idle"],
  blocked: ["idle", "hover"]
};
var HISTORY_LIMIT = 48;
var InteractionMachine = class {
  constructor(clock = () => typeof performance !== "undefined" ? performance.now() : Date.now()) {
    this._phase = "idle";
    this._previous = "idle";
    this._reason = "init";
    this._since = 0;
    this.listeners = /* @__PURE__ */ new Set();
    this._history = [];
    this._rejected = 0;
    this.clock = clock;
    this._since = this.clock();
  }
  get phase() {
    return this._phase;
  }
  get previous() {
    return this._previous;
  }
  get reason() {
    return this._reason;
  }
  get rejectedTransitions() {
    return this._rejected;
  }
  get history() {
    return this._history;
  }
  snapshot() {
    return {
      phase: this._phase,
      previous: this._previous,
      reason: this._reason,
      elapsed: this.clock() - this._since
    };
  }
  is(...phases) {
    return phases.includes(this._phase);
  }
  /** True when the transition is legal from the current phase. */
  can(next) {
    return TRANSITIONS[this._phase].includes(next);
  }
  /**
   * Attempt a transition. Returns `true` when applied.
   * A no-op request (`next === phase`) is treated as success and restarts the
   * timer, because "drag again while dragging" is a legitimate refresh.
   */
  to(next, reason = "") {
    if (next === this._phase) {
      this._reason = reason || this._reason;
      this._since = this.clock();
      return true;
    }
    if (!this.can(next)) {
      this._rejected++;
      return false;
    }
    const now2 = this.clock();
    const change = {
      from: this._phase,
      to: next,
      reason,
      duration: now2 - this._since,
      time: now2
    };
    this._previous = this._phase;
    this._phase = next;
    this._reason = reason;
    this._since = now2;
    this._history.push(change);
    if (this._history.length > HISTORY_LIMIT) this._history.shift();
    safeNotify(this.listeners, change);
    return true;
  }
  /** Convenience: transition only when currently in one of `from`. */
  from(phases, next, reason = "") {
    const list = Array.isArray(phases) ? phases : [phases];
    if (!list.includes(this._phase)) {
      this._rejected++;
      return false;
    }
    return this.to(next, reason);
  }
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  reset() {
    this._phase = "idle";
    this._previous = "idle";
    this._reason = "reset";
    this._since = this.clock();
    this._history.length = 0;
    this._rejected = 0;
  }
};

// engine/src/effects/magnetic.ts
var Magnetic = class {
  constructor(el, options, ctx) {
    this.scope = new Disposer("magnetic");
    this.machine = new InteractionMachine();
    this.rest = { cx: 0, cy: 0, w: 0, h: 0 };
    this.pointer = { x: 0, y: 0, valid: false };
    this.engaged = false;
    this.removeFrame = null;
    var _a, _b, _c, _d, _e, _f, _g, _h;
    this.el = el;
    this.ctx = ctx;
    this.writer = new MotionWriter(el);
    this.opts = {
      radius: (_a = options.radius) != null ? _a : "auto",
      strength: clamp01((_b = options.strength) != null ? _b : 0.34),
      maxOffset: (_c = options.maxOffset) != null ? _c : 22,
      axis: (_d = options.axis) != null ? _d : "both",
      scale: (_e = options.scale) != null ? _e : 1,
      disabled: (_f = options.disabled) != null ? _f : false,
      spring: (_g = options.spring) != null ? _g : SPRING_PRESETS.tight,
      releaseSpring: (_h = options.releaseSpring) != null ? _h : SPRING_PRESETS.balanced
    };
    this.sx = new Spring(0, this.opts.spring);
    this.sy = new Spring(0, this.opts.spring);
    this.measure();
    this.bind();
    this.reduceListener = ctx.motion.subscribe(() => this.applyMotionMode());
    this.applyMotionMode();
  }
  /** Current phase — `hover` while pulled, `idle` otherwise. */
  get phase() {
    return this.machine.phase;
  }
  setDisabled(disabled) {
    this.opts.disabled = disabled;
    if (disabled) this.release("disabled");
  }
  /** Recompute the rest rect (call after layout changes you cause yourself). */
  measure() {
    const rect = this.el.getBoundingClientRect();
    this.rest = {
      cx: rect.left + rect.width / 2 - this.sx.value,
      cy: rect.top + rect.height / 2 - this.sy.value,
      w: rect.width,
      h: rect.height
    };
  }
  get radius() {
    if (this.opts.radius !== "auto") return this.opts.radius;
    return Math.max(this.rest.w, this.rest.h) * 0.55 + 24;
  }
  bind() {
    const scope = this.scope;
    scope.listen(window, "pointermove", (event) => this.onPointerMove(event), { passive: true });
    scope.listen(window, "pointerout", (event) => {
      if (!event.relatedTarget) this.release("left-window");
    });
    scope.listen(window, "blur", () => this.release("window-blur"));
    scope.listen(window, "scroll", () => this.measure(), { passive: true, capture: true });
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => this.measure());
      ro.observe(this.el);
      scope.onDispose(() => ro.disconnect());
    }
  }
  onPointerMove(event) {
    if (this.opts.disabled) return;
    if (event.buttons !== 0) {
      this.release("pointer-down");
      return;
    }
    if (this.ctx.reduced || !this.ctx.canHover) return;
    const r = this.radius;
    const d = distance(event.clientX, event.clientY, this.rest.cx, this.rest.cy);
    this.pointer = { x: event.clientX, y: event.clientY, valid: true };
    if (d > r) {
      if (this.engaged) this.release("out-of-radius");
      return;
    }
    if (!this.engaged) {
      this.engaged = true;
      this.machine.to("hover", "enter-radius");
      this.el.setAttribute("data-kinetic-magnetic", "engaged");
      this.el.style.willChange = "translate";
    }
    const falloff = easeOutQuad(1 - d / r);
    const dx = (event.clientX - this.rest.cx) * this.opts.strength * falloff;
    const dy = (event.clientY - this.rest.cy) * this.opts.strength * falloff;
    const cap = this.opts.maxOffset;
    if (this.opts.axis !== "y") this.sx.setTarget(clampAbs(dx, cap));
    if (this.opts.axis !== "x") this.sy.setTarget(clampAbs(dy, cap));
    this.ensureFrame();
  }
  release(reason) {
    var _a, _b;
    if (!this.engaged && this.sx.value === 0 && this.sy.value === 0) return;
    this.engaged = false;
    this.pointer.valid = false;
    this.machine.to("idle", reason);
    this.el.removeAttribute("data-kinetic-magnetic");
    this.sx.stiffness = (_a = this.opts.releaseSpring.stiffness) != null ? _a : SPRING_PRESETS.balanced.stiffness;
    this.sx.damping = (_b = this.opts.releaseSpring.damping) != null ? _b : SPRING_PRESETS.balanced.damping;
    this.sy.stiffness = this.sx.stiffness;
    this.sy.damping = this.sx.damping;
    if (this.ctx.reduced) {
      this.sx.jump(0);
      this.sy.jump(0);
      this.writer.reset();
      return;
    }
    this.sx.setTarget(0);
    this.sy.setTarget(0);
    this.ensureFrame();
  }
  ensureFrame() {
    if (this.removeFrame) return;
    this.removeFrame = this.ctx.loop.add((info) => this.tick(info.dtSec), 10);
  }
  tick(dtSec) {
    var _a;
    const x = this.sx.step(dtSec);
    const y = this.sy.step(dtSec);
    this.writer.write(x, y, this.engaged ? this.opts.scale : 1);
    if (!this.engaged && this.sx.settled && this.sy.settled) {
      this.writer.write(0, 0, 1);
      this.sx.jump(0);
      this.sy.jump(0);
      this.el.style.removeProperty("will-change");
      (_a = this.removeFrame) == null ? void 0 : _a.call(this);
      this.removeFrame = null;
    }
  }
  applyMotionMode() {
    if (this.ctx.reduced) {
      this.release("reduced-motion");
      this.writer.reset();
      this.el.setAttribute("data-kinetic-magnetic", "reduced");
    } else {
      this.el.removeAttribute("data-kinetic-magnetic");
    }
  }
  destroy() {
    var _a;
    (_a = this.removeFrame) == null ? void 0 : _a.call(this);
    this.removeFrame = null;
    this.reduceListener();
    this.scope.dispose();
    this.writer.reset();
    this.el.removeAttribute("data-kinetic-magnetic");
    this.el.style.removeProperty("will-change");
  }
};
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function clampAbs(v, cap) {
  return v > cap ? cap : v < -cap ? -cap : v;
}

// engine/src/effects/trail.ts
var Trail = class {
  constructor(canvas, options, ctx) {
    this.scope = new Disposer("trail");
    this.samples = [];
    this.removeFrame = null;
    this.dpr = 1;
    this.lastMove = 0;
    this.lastDraw = 0;
    this.active = false;
    this.disabled = false;
    var _a, _b, _c, _d, _e;
    this.canvas = canvas;
    this.engine = ctx;
    this.opts = {
      length: Math.max(2, (_a = options.length) != null ? _a : 26),
      width: Math.max(1, (_b = options.width) != null ? _b : 7),
      color: (_c = options.color) != null ? _c : "#e2703a",
      mode: (_d = options.mode) != null ? _d : "comet",
      fade: (_e = options.fade) != null ? _e : 180
    };
    this.ctx2d = canvas.getContext("2d");
    this.resize();
    this.bind(options.host);
    this.reduceUnsub = ctx.motion.subscribe(() => this.applyMotionMode());
    this.applyMotionMode();
  }
  get enabled() {
    return this.active && !this.disabled;
  }
  setDisabled(disabled) {
    this.disabled = disabled;
    if (disabled) this.clear();
    else this.applyMotionMode();
  }
  applyMotionMode() {
    const allowed = this.engine.motion.policy.allowTrail && this.engine.caps.hover;
    this.active = allowed;
    if (!allowed) this.clear();
  }
  bind(host) {
    const scope = this.scope;
    const target = host != null ? host : window;
    scope.listen(target, "pointermove", (event) => this.onMove(event), {
      passive: true
    });
    scope.listen(window, "pointerout", (event) => {
      if (!event.relatedTarget) this.clear();
    });
    scope.listen(window, "blur", () => this.clear());
    scope.listen(document, "visibilitychange", () => this.clear());
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(host != null ? host : document.documentElement);
      scope.onDispose(() => ro.disconnect());
    }
    scope.listen(window, "resize", () => this.resize(), { passive: true });
  }
  onMove(event) {
    if (!this.enabled) return;
    if (event.buttons !== 0) {
      this.clear();
      return;
    }
    const now2 = event.timeStamp || performance.now();
    const coalesced = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
    if (coalesced.length > 1) {
      const stride = Math.max(1, Math.ceil(coalesced.length / 8));
      for (let i = 0; i < coalesced.length; i += stride) {
        const e = coalesced[i];
        this.push(e.clientX, e.clientY, e.timeStamp || now2);
      }
    } else {
      this.push(event.clientX, event.clientY, now2);
    }
    this.lastMove = now2;
    this.ensureFrame();
  }
  push(x, y, t) {
    const last = this.samples[this.samples.length - 1];
    if (last && Math.abs(last.x - x) < 0.4 && Math.abs(last.y - y) < 0.4) return;
    this.samples.push({ x, y, t });
    const max = this.engine.loop.tier === "low" ? Math.max(4, Math.floor(this.opts.length * 0.4)) : this.opts.length;
    while (this.samples.length > max) this.samples.shift();
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width || this.canvas.clientWidth || window.innerWidth;
    const h = rect.height || this.canvas.clientHeight || window.innerHeight;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(w * this.dpr));
    this.canvas.height = Math.max(1, Math.round(h * this.dpr));
    if (this.ctx2d) this.ctx2d.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }
  ensureFrame() {
    if (this.removeFrame) return;
    this.removeFrame = this.engine.loop.add((info) => this.draw(info.time), 20);
  }
  draw(now2) {
    var _a;
    const ctx = this.ctx2d;
    if (!ctx) return;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    if (this.engine.loop.tier === "low" && now2 - this.lastDraw < 32) return;
    this.lastDraw = now2;
    ctx.clearRect(0, 0, w, h);
    const idle = now2 - this.lastMove;
    if (this.samples.length < 2 || idle > this.opts.fade * 3) {
      this.samples.length = 0;
      (_a = this.removeFrame) == null ? void 0 : _a.call(this);
      this.removeFrame = null;
      return;
    }
    const fadeT = idle <= this.opts.fade ? 1 : Math.max(0, 1 - (idle - this.opts.fade) / (this.opts.fade * 2));
    const n = this.samples.length;
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = this.opts.color;
    ctx.fillStyle = this.opts.color;
    for (let i = 1; i < n; i++) {
      const t = i / (n - 1);
      const a = this.samples[i - 1];
      const b = this.samples[i];
      const alpha = t * 0.55 * fadeT;
      if (alpha <= 5e-3) continue;
      ctx.globalAlpha = alpha;
      if (this.opts.mode === "dots") {
        ctx.beginPath();
        ctx.arc(b.x, b.y, Math.max(0.6, this.opts.width * 0.5 * t), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.lineWidth = Math.max(0.5, this.opts.width * t);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  clear() {
    this.samples.length = 0;
    if (this.ctx2d) {
      const { width, height } = this.canvas;
      this.ctx2d.clearRect(0, 0, width, height);
    }
  }
  destroy() {
    var _a;
    (_a = this.removeFrame) == null ? void 0 : _a.call(this);
    this.removeFrame = null;
    this.reduceUnsub();
    this.scope.dispose();
    this.clear();
  }
};

// engine/src/core/touch.ts
var TOUCH_ACTION = {
  // Horizontal-only drag: vertical panning must stay native, otherwise a card
  // carousel blocks the page from scrolling on a phone.
  x: "pan-y",
  y: "pan-x",
  both: "none",
  lock: "none"
};
function applyTouchAction(el, axis, disposer, enabled = true) {
  if (!enabled) return false;
  if (typeof getComputedStyle === "function") {
    try {
      const current = getComputedStyle(el).touchAction;
      if (current === TOUCH_ACTION[axis]) return false;
    } catch {
    }
  }
  disposer.style(el, "touch-action", TOUCH_ACTION[axis]);
  return true;
}
function suppressClick(disposer, window2 = 400) {
  const target = document;
  const handler = (event) => {
    event.preventDefault();
    event.stopPropagation();
    cleanup();
  };
  let timer = null;
  const cleanup = () => {
    target.removeEventListener("click", handler, true);
    if (timer) timer();
    timer = null;
  };
  target.addEventListener("click", handler, true);
  timer = disposer.timeout(cleanup, window2);
  disposer.onDispose(() => target.removeEventListener("click", handler, true));
}

// packages/core/src/utils/events.ts
var EVENT_TYPE_MAP = {
  pointer: { start: "down", change: "move", end: "up" },
  mouse: { start: "down", change: "move", end: "up" },
  touch: { start: "start", change: "move", end: "end" },
  gesture: { start: "start", change: "change", end: "end" }
};
function capitalize(string) {
  if (!string) return "";
  return string[0].toUpperCase() + string.slice(1);
}
var actionsWithoutCaptureSupported = ["enter", "leave"];
function hasCapture(capture = false, actionKey) {
  return capture && !actionsWithoutCaptureSupported.includes(actionKey);
}
function toHandlerProp(device, action = "", capture = false) {
  const deviceProps = EVENT_TYPE_MAP[device];
  const actionKey = deviceProps ? deviceProps[action] || action : action;
  return "on" + capitalize(device) + capitalize(actionKey) + (hasCapture(capture, actionKey) ? "Capture" : "");
}
var pointerCaptureEvents = ["gotpointercapture", "lostpointercapture"];
function parseProp(prop) {
  let eventKey = prop.substring(2).toLowerCase();
  const passive = !!~eventKey.indexOf("passive");
  if (passive) eventKey = eventKey.replace("passive", "");
  const captureKey = pointerCaptureEvents.includes(eventKey) ? "capturecapture" : "capture";
  const capture = !!~eventKey.indexOf(captureKey);
  if (capture) eventKey = eventKey.replace("capture", "");
  return { device: eventKey, capture, passive };
}
function toDomEventType(device, action = "") {
  const deviceProps = EVENT_TYPE_MAP[device];
  const actionKey = deviceProps ? deviceProps[action] || action : action;
  return device + actionKey;
}
function isTouch(event) {
  return "touches" in event;
}
function getPointerType(event) {
  if (isTouch(event)) return "touch";
  if ("pointerType" in event) return event.pointerType;
  return "mouse";
}
function getCurrentTargetTouchList(event) {
  return Array.from(event.touches).filter(
    (e) => {
      var _a, _b;
      return e.target === event.currentTarget || ((_b = (_a = event.currentTarget) == null ? void 0 : _a.contains) == null ? void 0 : _b.call(_a, e.target));
    }
  );
}
function getTouchList(event) {
  return event.type === "touchend" || event.type === "touchcancel" ? event.changedTouches : event.targetTouches;
}
function getValueEvent(event) {
  return isTouch(event) ? getTouchList(event)[0] : event;
}
function distanceAngle(P1, P2) {
  try {
    const dx = P2.clientX - P1.clientX;
    const dy = P2.clientY - P1.clientY;
    const cx = (P2.clientX + P1.clientX) / 2;
    const cy = (P2.clientY + P1.clientY) / 2;
    const distance2 = Math.hypot(dx, dy);
    const angle = -(Math.atan2(dx, dy) * 180) / Math.PI;
    const origin = [cx, cy];
    return { angle, distance: distance2, origin };
  } catch {
  }
  return null;
}
function touchIds(event) {
  return getCurrentTargetTouchList(event).map((touch) => touch.identifier);
}
function touchDistanceAngle(event, ids) {
  const [P1, P2] = Array.from(event.touches).filter((touch) => ids.includes(touch.identifier));
  return distanceAngle(P1, P2);
}
function pointerId(event) {
  const valueEvent = getValueEvent(event);
  return isTouch(event) ? valueEvent.identifier : valueEvent.pointerId;
}
function pointerValues(event) {
  const valueEvent = getValueEvent(event);
  return [valueEvent.clientX, valueEvent.clientY];
}
var LINE_HEIGHT = 40;
var PAGE_HEIGHT = 800;
function wheelValues(event) {
  let { deltaX, deltaY, deltaMode } = event;
  if (deltaMode === 1) {
    deltaX *= LINE_HEIGHT;
    deltaY *= LINE_HEIGHT;
  } else if (deltaMode === 2) {
    deltaX *= PAGE_HEIGHT;
    deltaY *= PAGE_HEIGHT;
  }
  return [deltaX, deltaY];
}
function getEventDetails(event) {
  const payload = {};
  if ("buttons" in event) payload.buttons = event.buttons;
  if ("shiftKey" in event) {
    const { shiftKey, altKey, metaKey, ctrlKey } = event;
    Object.assign(payload, { shiftKey, altKey, metaKey, ctrlKey });
  }
  return payload;
}

// packages/core/src/utils/fn.ts
function call(v, ...args) {
  if (typeof v === "function") {
    return v(...args);
  } else {
    return v;
  }
}
function noop() {
}
function chain(...fns) {
  if (fns.length === 0) return noop;
  if (fns.length === 1) return fns[0];
  return function() {
    let result;
    for (const fn of fns) {
      result = fn.apply(this, arguments) || result;
    }
    return result;
  };
}
function assignDefault(value, fallback) {
  return Object.assign({}, fallback, value || {});
}

// packages/core/src/utils/maths.ts
function clamp2(v, min, max) {
  return Math.max(min, Math.min(v, max));
}
var V = {
  toVector(v, fallback) {
    if (v === void 0) v = fallback;
    return Array.isArray(v) ? v : [v, v];
  },
  add(v1, v2) {
    return [v1[0] + v2[0], v1[1] + v2[1]];
  },
  sub(v1, v2) {
    return [v1[0] - v2[0], v1[1] - v2[1]];
  },
  addTo(v1, v2) {
    v1[0] += v2[0];
    v1[1] += v2[1];
  },
  subTo(v1, v2) {
    v1[0] -= v2[0];
    v1[1] -= v2[1];
  }
};
function rubberband(distance2, dimension, constant) {
  if (dimension === 0 || Math.abs(dimension) === Infinity) return Math.pow(distance2, constant * 5);
  return distance2 * dimension * constant / (dimension + constant * distance2);
}
function rubberbandIfOutOfBounds(position, min, max, constant = 0.15) {
  if (constant === 0) return clamp2(position, min, max);
  if (position < min) return -rubberband(min - position, max - min, constant) + min;
  if (position > max) return +rubberband(position - max, max - min, constant) + max;
  return position;
}
function computeRubberband(bounds, [Vx, Vy], [Rx, Ry]) {
  const [[X0, X1], [Y0, Y1]] = bounds;
  return [rubberbandIfOutOfBounds(Vx, X0, X1, Rx), rubberbandIfOutOfBounds(Vy, Y0, Y1, Ry)];
}

// packages/core/src/engines/Engine.ts
var BEFORE_LAST_KINEMATICS_DELAY = 32;
var Engine = class {
  constructor(ctrl, args, key) {
    /**
     * The Controller handling state.
     */
    __publicField(this, "ctrl");
    /**
     * The gesture key ('drag' | 'pinch' | 'wheel' | 'scroll' | 'move' | 'hover')
     */
    __publicField(this, "key");
    __publicField(this, "args");
    this.ctrl = ctrl;
    this.args = args;
    this.key = key;
    if (!this.state) {
      this.state = {};
      this.computeValues([0, 0]);
      this.computeInitial();
      if (this.init) this.init();
      this.reset();
    }
  }
  /**
   * Shortcut to the gesture state read from the Controller.
   */
  get state() {
    return this.ctrl.state[this.key];
  }
  set state(state) {
    this.ctrl.state[this.key] = state;
  }
  /**
   * Shortcut to the shared state read from the Controller
   */
  get shared() {
    return this.ctrl.state.shared;
  }
  /**
   * Shortcut to the gesture event store read from the Controller.
   */
  get eventStore() {
    return this.ctrl.gestureEventStores[this.key];
  }
  /**
   * Shortcut to the gesture timeout store read from the Controller.
   */
  get timeoutStore() {
    return this.ctrl.gestureTimeoutStores[this.key];
  }
  /**
   * Shortcut to the gesture config read from the Controller.
   */
  get config() {
    return this.ctrl.config[this.key];
  }
  /**
   * Shortcut to the shared config read from the Controller.
   */
  get sharedConfig() {
    return this.ctrl.config.shared;
  }
  /**
   * Shortcut to the gesture handler read from the Controller.
   */
  get handler() {
    return this.ctrl.handlers[this.key];
  }
  reset() {
    const { state, shared, ingKey, args } = this;
    shared[ingKey] = state._active = state.active = state._blocked = state._force = false;
    state._step = [false, false];
    state.intentional = false;
    state._movement = [0, 0];
    state._distance = [0, 0];
    state._direction = [0, 0];
    state._delta = [0, 0];
    state._bounds = [[-Infinity, Infinity], [-Infinity, Infinity]];
    state.args = args;
    state.axis = void 0;
    state.memo = void 0;
    state.elapsedTime = state.timeDelta = 0;
    state.direction = [0, 0];
    state.distance = [0, 0];
    state.overflow = [0, 0];
    state._movementBound = [false, false];
    state.velocity = [0, 0];
    state.movement = [0, 0];
    state.delta = [0, 0];
    state.timeStamp = 0;
  }
  /**
   * Function ran at the start of the gesture.
   * @param event
   */
  start(event) {
    const state = this.state;
    const config = this.config;
    if (!state._active) {
      this.reset();
      this.computeInitial();
      state._active = true;
      state.target = event.target;
      state.currentTarget = event.currentTarget;
      state.lastOffset = config.from ? call(config.from, state) : state.offset;
      state.offset = state.lastOffset;
      state.startTime = state.timeStamp = event.timeStamp;
    }
  }
  /**
   * Assign raw values to `state._values` and transformed values to
   * `state.values`.
   * @param values
   */
  computeValues(values) {
    const state = this.state;
    state._values = values;
    state.values = this.config.transform(values);
  }
  /**
   * Assign `state._values` to `state._initial` and transformed `state.values` to
   * `state.initial`.
   * @param values
   */
  computeInitial() {
    const state = this.state;
    state._initial = state._values;
    state.initial = state.values;
  }
  /**
   * Computes all sorts of state attributes, including kinematics.
   * @param event
   */
  compute(event) {
    const { state, config, shared } = this;
    state.args = this.args;
    let dt = 0;
    if (event) {
      state.event = event;
      if (config.preventDefault && event.cancelable) state.event.preventDefault();
      state.type = event.type;
      shared.touches = this.ctrl.pointerIds.size || this.ctrl.touchIds.size;
      shared.locked = !!document.pointerLockElement;
      Object.assign(shared, getEventDetails(event));
      shared.down = shared.pressed = shared.buttons % 2 === 1 || shared.touches > 0;
      dt = event.timeStamp - state.timeStamp;
      state.timeStamp = event.timeStamp;
      state.elapsedTime = state.timeStamp - state.startTime;
    }
    if (state._active) {
      const _absoluteDelta = state._delta.map(Math.abs);
      V.addTo(state._distance, _absoluteDelta);
    }
    if (this.axisIntent) this.axisIntent(event);
    const [_m0, _m1] = state._movement;
    const [t0, t1] = config.threshold;
    const { _step, values } = state;
    if (config.hasCustomTransform) {
      if (_step[0] === false) _step[0] = Math.abs(_m0) >= t0 && values[0];
      if (_step[1] === false) _step[1] = Math.abs(_m1) >= t1 && values[1];
    } else {
      if (_step[0] === false) _step[0] = Math.abs(_m0) >= t0 && Math.sign(_m0) * t0;
      if (_step[1] === false) _step[1] = Math.abs(_m1) >= t1 && Math.sign(_m1) * t1;
    }
    state.intentional = _step[0] !== false || _step[1] !== false;
    if (!state.intentional) return;
    const movement = [0, 0];
    if (config.hasCustomTransform) {
      const [v0, v1] = values;
      movement[0] = _step[0] !== false ? v0 - _step[0] : 0;
      movement[1] = _step[1] !== false ? v1 - _step[1] : 0;
    } else {
      movement[0] = _step[0] !== false ? _m0 - _step[0] : 0;
      movement[1] = _step[1] !== false ? _m1 - _step[1] : 0;
    }
    if (this.restrictToAxis && !state._blocked) this.restrictToAxis(movement);
    const previousOffset = state.offset;
    const gestureIsActive = state._active && !state._blocked || state.active;
    if (gestureIsActive) {
      state.first = state._active && !state.active;
      state.last = !state._active && state.active;
      state.active = shared[this.ingKey] = state._active;
      if (event) {
        if (state.first) {
          if ("bounds" in config) state._bounds = call(config.bounds, state);
          if (this.setup) this.setup();
        }
        state.movement = movement;
        this.computeOffset();
      }
    }
    const [ox, oy] = state.offset;
    const [[x0, x1], [y0, y1]] = state._bounds;
    state.overflow = [ox < x0 ? -1 : ox > x1 ? 1 : 0, oy < y0 ? -1 : oy > y1 ? 1 : 0];
    state._movementBound[0] = state.overflow[0] ? state._movementBound[0] === false ? state._movement[0] : state._movementBound[0] : false;
    state._movementBound[1] = state.overflow[1] ? state._movementBound[1] === false ? state._movement[1] : state._movementBound[1] : false;
    const rubberband2 = state._active ? config.rubberband || [0, 0] : [0, 0];
    state.offset = computeRubberband(state._bounds, state.offset, rubberband2);
    state.delta = V.sub(state.offset, previousOffset);
    this.computeMovement();
    if (gestureIsActive && (!state.last || dt > BEFORE_LAST_KINEMATICS_DELAY)) {
      state.delta = V.sub(state.offset, previousOffset);
      const absoluteDelta = state.delta.map(Math.abs);
      V.addTo(state.distance, absoluteDelta);
      state.direction = state.delta.map(Math.sign);
      state._direction = state._delta.map(Math.sign);
      if (!state.first && dt > 0) {
        state.velocity = [absoluteDelta[0] / dt, absoluteDelta[1] / dt];
        state.timeDelta = dt;
      }
    }
  }
  /**
   * Fires the gesture handler.
   */
  emit() {
    const state = this.state;
    const shared = this.shared;
    const config = this.config;
    if (!state._active) this.clean();
    if ((state._blocked || !state.intentional) && !state._force && !config.triggerAllEvents) return;
    const memo = this.handler({ ...shared, ...state, [this.aliasKey]: state.values });
    if (memo !== void 0) state.memo = memo;
  }
  /**
   * Cleans the gesture timeouts and event listeners.
   */
  clean() {
    this.eventStore.clean();
    this.timeoutStore.clean();
  }
};

// packages/core/src/engines/CoordinatesEngine.ts
function selectAxis([dx, dy], threshold) {
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (absDx > absDy && absDx > threshold) {
    return "x";
  }
  if (absDy > absDx && absDy > threshold) {
    return "y";
  }
  return void 0;
}
var CoordinatesEngine = class extends Engine {
  constructor() {
    super(...arguments);
    __publicField(this, "aliasKey", "xy");
  }
  reset() {
    super.reset();
    this.state.axis = void 0;
  }
  init() {
    this.state.offset = [0, 0];
    this.state.lastOffset = [0, 0];
  }
  computeOffset() {
    this.state.offset = V.add(this.state.lastOffset, this.state.movement);
  }
  computeMovement() {
    this.state.movement = V.sub(this.state.offset, this.state.lastOffset);
  }
  axisIntent(event) {
    const state = this.state;
    const config = this.config;
    if (!state.axis && event) {
      const threshold = typeof config.axisThreshold === "object" ? config.axisThreshold[getPointerType(event)] : config.axisThreshold;
      state.axis = selectAxis(state._movement, threshold);
    }
    state._blocked = (config.lockDirection || !!config.axis) && !state.axis || !!config.axis && config.axis !== state.axis;
  }
  restrictToAxis(v) {
    if (this.config.axis || this.config.lockDirection) {
      switch (this.state.axis) {
        case "x":
          v[1] = 0;
          break;
        // [ x, 0 ]
        case "y":
          v[0] = 0;
          break;
      }
    }
  }
};

// packages/core/src/config/commonConfigResolver.ts
var identity = (v) => v;
var DEFAULT_RUBBERBAND = 0.15;
var commonConfigResolver = {
  enabled(value = true) {
    return value;
  },
  eventOptions(value, _k, config) {
    return { ...config.shared.eventOptions, ...value };
  },
  preventDefault(value = false) {
    return value;
  },
  triggerAllEvents(value = false) {
    return value;
  },
  rubberband(value = 0) {
    switch (value) {
      case true:
        return [DEFAULT_RUBBERBAND, DEFAULT_RUBBERBAND];
      case false:
        return [0, 0];
      default:
        return V.toVector(value);
    }
  },
  from(value) {
    if (typeof value === "function") return value;
    if (value != null) return V.toVector(value);
  },
  transform(value, _k, config) {
    const transform = value || config.shared.transform;
    this.hasCustomTransform = !!transform;
    if (false) {
      const originalTransform = transform || identity;
      return (v) => {
        const r = originalTransform(v);
        if (!isFinite(r[0]) || !isFinite(r[1])) {
          console.warn(`[@use-gesture]: config.transform() must produce a valid result, but it was: [${r[0]},${[1]}]`);
        }
        return r;
      };
    }
    return transform || identity;
  },
  threshold(value) {
    return V.toVector(value, 0);
  }
};
if (false) {
  Object.assign(commonConfigResolver, {
    domTarget(value) {
      if (value !== void 0) {
        throw Error(`[@use-gesture]: \`domTarget\` option has been renamed to \`target\`.`);
      }
      return NaN;
    },
    lockDirection(value) {
      if (value !== void 0) {
        throw Error(
          `[@use-gesture]: \`lockDirection\` option has been merged with \`axis\`. Use it as in \`{ axis: 'lock' }\``
        );
      }
      return NaN;
    },
    initial(value) {
      if (value !== void 0) {
        throw Error(`[@use-gesture]: \`initial\` option has been renamed to \`from\`.`);
      }
      return NaN;
    }
  });
}

// packages/core/src/config/coordinatesConfigResolver.ts
var DEFAULT_AXIS_THRESHOLD = 0;
var coordinatesConfigResolver = {
  ...commonConfigResolver,
  axis(_v, _k, { axis }) {
    this.lockDirection = axis === "lock";
    if (!this.lockDirection) return axis;
  },
  axisThreshold(value = DEFAULT_AXIS_THRESHOLD) {
    return value;
  },
  bounds(value = {}) {
    if (typeof value === "function") {
      return (state) => coordinatesConfigResolver.bounds(value(state));
    }
    if ("current" in value) {
      return () => value.current;
    }
    if (typeof HTMLElement === "function" && value instanceof HTMLElement) {
      return value;
    }
    const { left = -Infinity, right = Infinity, top = -Infinity, bottom = Infinity } = value;
    return [
      [left, right],
      [top, bottom]
    ];
  }
};

// packages/core/src/engines/DragEngine.ts
var KEYS_DELTA_MAP = {
  ArrowRight: (displacement, factor = 1) => [displacement * factor, 0],
  ArrowLeft: (displacement, factor = 1) => [-1 * displacement * factor, 0],
  ArrowUp: (displacement, factor = 1) => [0, -1 * displacement * factor],
  ArrowDown: (displacement, factor = 1) => [0, displacement * factor]
};
var DragEngine = class extends CoordinatesEngine {
  constructor() {
    super(...arguments);
    __publicField(this, "ingKey", "dragging");
  }
  // superseeds generic Engine reset call
  reset() {
    super.reset();
    const state = this.state;
    state._pointerId = void 0;
    state._pointerActive = false;
    state._keyboardActive = false;
    state._preventScroll = false;
    state._delayed = false;
    state.swipe = [0, 0];
    state.tap = false;
    state.canceled = false;
    state.cancel = this.cancel.bind(this);
  }
  setup() {
    const state = this.state;
    if (state._bounds instanceof HTMLElement) {
      const boundRect = state._bounds.getBoundingClientRect();
      const targetRect = state.currentTarget.getBoundingClientRect();
      const _bounds = {
        left: boundRect.left - targetRect.left + state.offset[0],
        right: boundRect.right - targetRect.right + state.offset[0],
        top: boundRect.top - targetRect.top + state.offset[1],
        bottom: boundRect.bottom - targetRect.bottom + state.offset[1]
      };
      state._bounds = coordinatesConfigResolver.bounds(_bounds);
    }
  }
  cancel() {
    const state = this.state;
    if (state.canceled) return;
    state.canceled = true;
    state._active = false;
    setTimeout(() => {
      this.compute();
      this.emit();
    }, 0);
  }
  setActive() {
    this.state._active = this.state._pointerActive || this.state._keyboardActive;
  }
  // superseeds Engine clean function
  clean() {
    this.pointerClean();
    this.state._pointerActive = false;
    this.state._keyboardActive = false;
    super.clean();
  }
  pointerDown(event) {
    const config = this.config;
    const state = this.state;
    if (event.buttons != null && // If the user submits an array as pointer.buttons, don't start the drag
    // if event.buttons isn't included inside that array.
    (Array.isArray(config.pointerButtons) ? !config.pointerButtons.includes(event.buttons) : (
      // If the user submits a number as pointer.buttons, refuse the drag if
      // config.pointerButtons is different than `-1` and if event.buttons
      // doesn't match the combination.
      config.pointerButtons !== -1 && config.pointerButtons !== event.buttons
    )))
      return;
    const ctrlIds = this.ctrl.setEventIds(event);
    if (config.pointerCapture) {
      ;
      event.target.setPointerCapture(event.pointerId);
    }
    if (
      // in some situations (https://github.com/pmndrs/use-gesture/issues/494#issuecomment-1127584116)
      // like when a new browser tab is opened during a drag gesture, the drag
      // can be interrupted mid-way, and can stall. This happens because the
      // pointerId that initiated the gesture is lost, and since the drag
      // persists until that pointerId is lifted with pointerup, it never ends.
      //
      // Therefore, when we detect that only one pointer is pressing the screen,
      // we consider that the gesture can proceed.
      ctrlIds && ctrlIds.size > 1 && state._pointerActive
    )
      return;
    this.start(event);
    this.setupPointer(event);
    state._pointerId = pointerId(event);
    state._pointerActive = true;
    this.computeValues(pointerValues(event));
    this.computeInitial();
    if (config.preventScrollAxis && getPointerType(event) !== "mouse") {
      state._active = false;
      this.setupScrollPrevention(event);
    } else if (config.delay > 0) {
      this.setupDelayTrigger(event);
      if (config.triggerAllEvents) {
        this.compute(event);
        this.emit();
      }
    } else {
      this.startPointerDrag(event);
    }
  }
  startPointerDrag(event) {
    const state = this.state;
    state._active = true;
    state._preventScroll = true;
    state._delayed = false;
    this.compute(event);
    this.emit();
  }
  pointerMove(event) {
    const state = this.state;
    const config = this.config;
    if (!state._pointerActive) return;
    const id = pointerId(event);
    if (state._pointerId !== void 0 && id !== state._pointerId) return;
    const _values = pointerValues(event);
    if (document.pointerLockElement === event.target) {
      state._delta = [event.movementX, event.movementY];
    } else {
      state._delta = V.sub(_values, state._values);
      this.computeValues(_values);
    }
    V.addTo(state._movement, state._delta);
    this.compute(event);
    if (state._delayed && state.intentional) {
      this.timeoutStore.remove("dragDelay");
      state.active = false;
      this.startPointerDrag(event);
      return;
    }
    if (config.preventScrollAxis && !state._preventScroll) {
      if (state.axis) {
        if (state.axis === config.preventScrollAxis || config.preventScrollAxis === "xy") {
          state._active = false;
          this.clean();
          return;
        } else {
          this.timeoutStore.remove("startPointerDrag");
          this.startPointerDrag(event);
          return;
        }
      } else {
        return;
      }
    }
    this.emit();
  }
  pointerUp(event) {
    this.ctrl.setEventIds(event);
    try {
      if (this.config.pointerCapture && event.target.hasPointerCapture(event.pointerId)) {
        ;
        event.target.releasePointerCapture(event.pointerId);
      }
    } catch {
      if (false) {
        console.warn(
          `[@use-gesture]: If you see this message, it's likely that you're using an outdated version of \`@react-three/fiber\`. 

Please upgrade to the latest version.`
        );
      }
    }
    const state = this.state;
    const config = this.config;
    if (!state._active || !state._pointerActive) return;
    const id = pointerId(event);
    if (state._pointerId !== void 0 && id !== state._pointerId) return;
    this.state._pointerActive = false;
    this.setActive();
    this.compute(event);
    const [dx, dy] = state._distance;
    state.tap = dx <= config.tapsThreshold && dy <= config.tapsThreshold;
    if (state.tap && config.filterTaps) {
      state._force = true;
    } else {
      const [_dx, _dy] = state._delta;
      const [_mx, _my] = state._movement;
      const [svx, svy] = config.swipe.velocity;
      const [sx, sy] = config.swipe.distance;
      const sdt = config.swipe.duration;
      if (state.elapsedTime < sdt) {
        const _vx = Math.abs(_dx / state.timeDelta);
        const _vy = Math.abs(_dy / state.timeDelta);
        if (_vx > svx && Math.abs(_mx) > sx) state.swipe[0] = Math.sign(_dx);
        if (_vy > svy && Math.abs(_my) > sy) state.swipe[1] = Math.sign(_dy);
      }
    }
    this.emit();
  }
  pointerClick(event) {
    if (!this.state.tap && event.detail > 0) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
  setupPointer(event) {
    const config = this.config;
    const device = config.device;
    if (false) {
      try {
        if (device === "pointer" && config.preventScrollDelay === void 0) {
          const currentTarget = "uv" in event ? event.sourceEvent.currentTarget : event.currentTarget;
          const style = window.getComputedStyle(currentTarget);
          if (style.touchAction === "auto") {
            console.warn(
              `[@use-gesture]: The drag target has its \`touch-action\` style property set to \`auto\`. It is recommended to add \`touch-action: 'none'\` so that the drag gesture behaves correctly on touch-enabled devices. For more information read this: https://use-gesture.netlify.app/docs/extras/#touch-action.

This message will only show in development mode. It won't appear in production. If this is intended, you can ignore it.`,
              currentTarget
            );
          }
        }
      } catch {
      }
    }
    if (config.pointerLock) {
      ;
      event.currentTarget.requestPointerLock();
    }
    if (!config.pointerCapture) {
      this.eventStore.add(this.sharedConfig.window, device, "change", this.pointerMove.bind(this));
      this.eventStore.add(this.sharedConfig.window, device, "end", this.pointerUp.bind(this));
      this.eventStore.add(this.sharedConfig.window, device, "cancel", this.pointerUp.bind(this));
    }
  }
  pointerClean() {
    if (this.config.pointerLock && document.pointerLockElement === this.state.currentTarget) {
      document.exitPointerLock();
    }
  }
  preventScroll(event) {
    if (this.state._preventScroll && event.cancelable) {
      event.preventDefault();
    }
  }
  setupScrollPrevention(event) {
    this.state._preventScroll = false;
    persistEvent(event);
    const remove = this.eventStore.add(this.sharedConfig.window, "touch", "change", this.preventScroll.bind(this), {
      passive: false
    });
    this.eventStore.add(this.sharedConfig.window, "touch", "end", remove);
    this.eventStore.add(this.sharedConfig.window, "touch", "cancel", remove);
    this.timeoutStore.add("startPointerDrag", this.startPointerDrag.bind(this), this.config.preventScrollDelay, event);
  }
  setupDelayTrigger(event) {
    this.state._delayed = true;
    this.timeoutStore.add(
      "dragDelay",
      () => {
        this.state._step = [0, 0];
        this.startPointerDrag(event);
      },
      this.config.delay
    );
  }
  keyDown(event) {
    const deltaFn = KEYS_DELTA_MAP[event.key];
    if (deltaFn) {
      const state = this.state;
      const factor = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
      this.start(event);
      state._delta = deltaFn(this.config.keyboardDisplacement, factor);
      state._keyboardActive = true;
      V.addTo(state._movement, state._delta);
      this.compute(event);
      this.emit();
    }
  }
  keyUp(event) {
    if (!(event.key in KEYS_DELTA_MAP)) return;
    this.state._keyboardActive = false;
    this.setActive();
    this.compute(event);
    this.emit();
  }
  bind(bindFunction) {
    const device = this.config.device;
    bindFunction(device, "start", this.pointerDown.bind(this));
    if (this.config.pointerCapture) {
      bindFunction(device, "change", this.pointerMove.bind(this));
      bindFunction(device, "end", this.pointerUp.bind(this));
      bindFunction(device, "cancel", this.pointerUp.bind(this));
      bindFunction("lostPointerCapture", "", this.pointerUp.bind(this));
    }
    if (this.config.keys) {
      bindFunction("key", "down", this.keyDown.bind(this));
      bindFunction("key", "up", this.keyUp.bind(this));
    }
    if (this.config.filterTaps) {
      bindFunction("click", "", this.pointerClick.bind(this), { capture: true, passive: false });
    }
  }
};
function persistEvent(event) {
  "persist" in event && typeof event.persist === "function" && event.persist();
}

// packages/core/src/config/support.ts
var isBrowser = typeof window !== "undefined" && window.document && window.document.createElement;
function supportsTouchEvents() {
  return isBrowser && "ontouchstart" in window;
}
function isTouchScreen() {
  return supportsTouchEvents() || isBrowser && window.navigator.maxTouchPoints > 1;
}
function supportsPointerEvents() {
  return isBrowser && "onpointerdown" in window;
}
function supportsPointerLock() {
  return isBrowser && "exitPointerLock" in window.document;
}
function supportsGestureEvents() {
  try {
    return "constructor" in GestureEvent;
  } catch (e) {
    return false;
  }
}
var SUPPORT = {
  isBrowser,
  gesture: supportsGestureEvents(),
  /**
   * It looks from https://github.com/pmndrs/use-gesture/discussions/421 that
   * some touchscreens using webkits don't have 'ontouchstart' in window. So
   * we're considering that browsers support TouchEvent if they have
   * `maxTouchPoints > 1`
   *
   * Update 16/09/2023: This generates failure on other Windows systems, so reverting
   * back to detecting TouchEvent support only.
   * https://github.com/pmndrs/use-gesture/issues/626
   */
  touch: supportsTouchEvents(),
  // touch: isTouchScreen(),
  touchscreen: isTouchScreen(),
  pointer: supportsPointerEvents(),
  pointerLock: supportsPointerLock()
};

// packages/core/src/config/dragConfigResolver.ts
var DEFAULT_PREVENT_SCROLL_DELAY = 250;
var DEFAULT_DRAG_DELAY = 180;
var DEFAULT_SWIPE_VELOCITY = 0.5;
var DEFAULT_SWIPE_DISTANCE = 50;
var DEFAULT_SWIPE_DURATION = 250;
var DEFAULT_KEYBOARD_DISPLACEMENT = 10;
var DEFAULT_DRAG_AXIS_THRESHOLD = { mouse: 0, touch: 0, pen: 8 };
var dragConfigResolver = {
  ...coordinatesConfigResolver,
  device(_v, _k, { pointer: { touch = false, lock = false, mouse = false } = {} }) {
    this.pointerLock = lock && SUPPORT.pointerLock;
    if (SUPPORT.touch && touch) return "touch";
    if (this.pointerLock) return "mouse";
    if (SUPPORT.pointer && !mouse) return "pointer";
    if (SUPPORT.touch) return "touch";
    return "mouse";
  },
  preventScrollAxis(value, _k, { preventScroll }) {
    this.preventScrollDelay = typeof preventScroll === "number" ? preventScroll : preventScroll || preventScroll === void 0 && value ? DEFAULT_PREVENT_SCROLL_DELAY : void 0;
    if (!SUPPORT.touchscreen || preventScroll === false) return void 0;
    return value ? value : preventScroll !== void 0 ? "y" : void 0;
  },
  pointerCapture(_v, _k, { pointer: { capture = true, buttons = 1, keys = true } = {} }) {
    this.pointerButtons = buttons;
    this.keys = keys;
    return !this.pointerLock && this.device === "pointer" && capture;
  },
  threshold(value, _k, { filterTaps = false, tapsThreshold = 3, axis = void 0 }) {
    const threshold = V.toVector(value, filterTaps ? tapsThreshold : axis ? 1 : 0);
    this.filterTaps = filterTaps;
    this.tapsThreshold = tapsThreshold;
    return threshold;
  },
  swipe({ velocity = DEFAULT_SWIPE_VELOCITY, distance: distance2 = DEFAULT_SWIPE_DISTANCE, duration = DEFAULT_SWIPE_DURATION } = {}) {
    return {
      velocity: this.transform(V.toVector(velocity)),
      distance: this.transform(V.toVector(distance2)),
      duration
    };
  },
  delay(value = 0) {
    switch (value) {
      case true:
        return DEFAULT_DRAG_DELAY;
      case false:
        return 0;
      default:
        return value;
    }
  },
  axisThreshold(value) {
    if (!value) return DEFAULT_DRAG_AXIS_THRESHOLD;
    return { ...DEFAULT_DRAG_AXIS_THRESHOLD, ...value };
  },
  keyboardDisplacement(value = DEFAULT_KEYBOARD_DISPLACEMENT) {
    return value;
  }
};
if (false) {
  Object.assign(dragConfigResolver, {
    useTouch(value) {
      if (value !== void 0) {
        throw Error(
          `[@use-gesture]: \`useTouch\` option has been renamed to \`pointer.touch\`. Use it as in \`{ pointer: { touch: true } }\`.`
        );
      }
      return NaN;
    },
    experimental_preventWindowScrollY(value) {
      if (value !== void 0) {
        throw Error(
          `[@use-gesture]: \`experimental_preventWindowScrollY\` option has been renamed to \`preventScroll\`.`
        );
      }
      return NaN;
    },
    swipeVelocity(value) {
      if (value !== void 0) {
        throw Error(
          `[@use-gesture]: \`swipeVelocity\` option has been renamed to \`swipe.velocity\`. Use it as in \`{ swipe: { velocity: 0.5 } }\`.`
        );
      }
      return NaN;
    },
    swipeDistance(value) {
      if (value !== void 0) {
        throw Error(
          `[@use-gesture]: \`swipeDistance\` option has been renamed to \`swipe.distance\`. Use it as in \`{ swipe: { distance: 50 } }\`.`
        );
      }
      return NaN;
    },
    swipeDuration(value) {
      if (value !== void 0) {
        throw Error(
          `[@use-gesture]: \`swipeDuration\` option has been renamed to \`swipe.duration\`. Use it as in \`{ swipe: { duration: 250 } }\`.`
        );
      }
      return NaN;
    }
  });
}

// packages/core/src/utils/state.ts
function clampStateInternalMovementToBounds(state) {
  const [ox, oy] = state.overflow;
  const [dx, dy] = state._delta;
  const [dirx, diry] = state._direction;
  if (ox < 0 && dx > 0 && dirx < 0 || ox > 0 && dx < 0 && dirx > 0) {
    state._movement[0] = state._movementBound[0];
  }
  if (oy < 0 && dy > 0 && diry < 0 || oy > 0 && dy < 0 && diry > 0) {
    state._movement[1] = state._movementBound[1];
  }
}

// packages/core/src/engines/PinchEngine.ts
var SCALE_ANGLE_RATIO_INTENT_DEG = 30;
var PINCH_WHEEL_RATIO = 100;
var PinchEngine = class extends Engine {
  constructor() {
    super(...arguments);
    __publicField(this, "ingKey", "pinching");
    __publicField(this, "aliasKey", "da");
  }
  init() {
    this.state.offset = [1, 0];
    this.state.lastOffset = [1, 0];
    this.state._pointerEvents = /* @__PURE__ */ new Map();
  }
  // superseeds generic Engine reset call
  reset() {
    super.reset();
    const state = this.state;
    state._touchIds = [];
    state.canceled = false;
    state.cancel = this.cancel.bind(this);
    state.turns = 0;
  }
  computeOffset() {
    const { type, movement, lastOffset } = this.state;
    if (type === "wheel") {
      this.state.offset = V.add(movement, lastOffset);
    } else {
      this.state.offset = [(1 + movement[0]) * lastOffset[0], movement[1] + lastOffset[1]];
    }
  }
  computeMovement() {
    const { offset, lastOffset } = this.state;
    this.state.movement = [offset[0] / lastOffset[0], offset[1] - lastOffset[1]];
  }
  axisIntent() {
    const state = this.state;
    const [_m0, _m1] = state._movement;
    if (!state.axis) {
      const axisMovementDifference = Math.abs(_m0) * SCALE_ANGLE_RATIO_INTENT_DEG - Math.abs(_m1);
      if (axisMovementDifference < 0) state.axis = "angle";
      else if (axisMovementDifference > 0) state.axis = "scale";
    }
  }
  restrictToAxis(v) {
    if (this.config.lockDirection) {
      if (this.state.axis === "scale") v[1] = 0;
      else if (this.state.axis === "angle") v[0] = 0;
    }
  }
  cancel() {
    const state = this.state;
    if (state.canceled) return;
    setTimeout(() => {
      state.canceled = true;
      state._active = false;
      this.compute();
      this.emit();
    }, 0);
  }
  touchStart(event) {
    this.ctrl.setEventIds(event);
    const state = this.state;
    const ctrlTouchIds = this.ctrl.touchIds;
    if (state._active) {
      if (state._touchIds.every((id) => ctrlTouchIds.has(id))) return;
    }
    if (ctrlTouchIds.size < 2) return;
    this.start(event);
    state._touchIds = Array.from(ctrlTouchIds).slice(0, 2);
    const payload = touchDistanceAngle(event, state._touchIds);
    if (!payload) return;
    this.pinchStart(event, payload);
  }
  pointerStart(event) {
    if (event.buttons != null && event.buttons % 2 !== 1) return;
    this.ctrl.setEventIds(event);
    event.target.setPointerCapture(event.pointerId);
    const state = this.state;
    const _pointerEvents = state._pointerEvents;
    const ctrlPointerIds = this.ctrl.pointerIds;
    if (state._active) {
      if (Array.from(_pointerEvents.keys()).every((id) => ctrlPointerIds.has(id))) return;
    }
    if (_pointerEvents.size < 2) {
      _pointerEvents.set(event.pointerId, event);
    }
    if (state._pointerEvents.size < 2) return;
    this.start(event);
    const payload = distanceAngle(...Array.from(_pointerEvents.values()));
    if (!payload) return;
    this.pinchStart(event, payload);
  }
  pinchStart(event, payload) {
    const state = this.state;
    state.origin = payload.origin;
    this.computeValues([payload.distance, payload.angle]);
    this.computeInitial();
    this.compute(event);
    this.emit();
  }
  touchMove(event) {
    if (!this.state._active) return;
    const payload = touchDistanceAngle(event, this.state._touchIds);
    if (!payload) return;
    this.pinchMove(event, payload);
  }
  pointerMove(event) {
    const _pointerEvents = this.state._pointerEvents;
    if (_pointerEvents.has(event.pointerId)) {
      _pointerEvents.set(event.pointerId, event);
    }
    if (!this.state._active) return;
    const payload = distanceAngle(...Array.from(_pointerEvents.values()));
    if (!payload) return;
    this.pinchMove(event, payload);
  }
  pinchMove(event, payload) {
    const state = this.state;
    const prev_a = state._values[1];
    const delta_a = payload.angle - prev_a;
    let delta_turns = 0;
    if (Math.abs(delta_a) > 270) delta_turns += Math.sign(delta_a);
    this.computeValues([payload.distance, payload.angle - 360 * delta_turns]);
    state.origin = payload.origin;
    state.turns = delta_turns;
    state._movement = [state._values[0] / state._initial[0] - 1, state._values[1] - state._initial[1]];
    this.compute(event);
    this.emit();
  }
  touchEnd(event) {
    this.ctrl.setEventIds(event);
    if (!this.state._active) return;
    if (this.state._touchIds.some((id) => !this.ctrl.touchIds.has(id))) {
      this.state._active = false;
      this.compute(event);
      this.emit();
    }
  }
  pointerEnd(event) {
    const state = this.state;
    this.ctrl.setEventIds(event);
    try {
      event.target.releasePointerCapture(event.pointerId);
    } catch {
    }
    if (state._pointerEvents.has(event.pointerId)) {
      state._pointerEvents.delete(event.pointerId);
    }
    if (!state._active) return;
    if (state._pointerEvents.size < 2) {
      state._active = false;
      this.compute(event);
      this.emit();
    }
  }
  gestureStart(event) {
    if (event.cancelable) event.preventDefault();
    const state = this.state;
    if (state._active) return;
    this.start(event);
    this.computeValues([event.scale, event.rotation]);
    state.origin = [event.clientX, event.clientY];
    this.compute(event);
    this.emit();
  }
  gestureMove(event) {
    if (event.cancelable) event.preventDefault();
    if (!this.state._active) return;
    const state = this.state;
    this.computeValues([event.scale, event.rotation]);
    state.origin = [event.clientX, event.clientY];
    const _previousMovement = state._movement;
    state._movement = [event.scale - 1, event.rotation];
    state._delta = V.sub(state._movement, _previousMovement);
    this.compute(event);
    this.emit();
  }
  gestureEnd(event) {
    if (!this.state._active) return;
    this.state._active = false;
    this.compute(event);
    this.emit();
  }
  wheel(event) {
    const modifierKey = this.config.modifierKey;
    if (modifierKey && (Array.isArray(modifierKey) ? !modifierKey.find((k) => event[k]) : !event[modifierKey])) return;
    if (!this.state._active) this.wheelStart(event);
    else this.wheelChange(event);
    this.timeoutStore.add("wheelEnd", this.wheelEnd.bind(this));
  }
  wheelStart(event) {
    this.start(event);
    this.wheelChange(event);
  }
  wheelChange(event) {
    const isR3f = "uv" in event;
    if (!isR3f) {
      if (event.cancelable) {
        event.preventDefault();
      }
      if (false) {
        console.warn(
          `[@use-gesture]: To properly support zoom on trackpads, try using the \`target\` option.

This message will only appear in development mode.`
        );
      }
    }
    const state = this.state;
    state._delta = [-wheelValues(event)[1] / PINCH_WHEEL_RATIO * state.offset[0], 0];
    V.addTo(state._movement, state._delta);
    clampStateInternalMovementToBounds(state);
    this.state.origin = [event.clientX, event.clientY];
    this.compute(event);
    this.emit();
  }
  wheelEnd() {
    if (!this.state._active) return;
    this.state._active = false;
    this.compute();
    this.emit();
  }
  bind(bindFunction) {
    const device = this.config.device;
    if (!!device) {
      bindFunction(device, "start", this[device + "Start"].bind(this));
      bindFunction(device, "change", this[device + "Move"].bind(this));
      bindFunction(device, "end", this[device + "End"].bind(this));
      bindFunction(device, "cancel", this[device + "End"].bind(this));
      bindFunction("lostPointerCapture", "", this[device + "End"].bind(this));
    }
    if (this.config.pinchOnWheel) {
      bindFunction("wheel", "", this.wheel.bind(this), { passive: false });
    }
  }
};

// packages/core/src/config/pinchConfigResolver.ts
var pinchConfigResolver = {
  ...commonConfigResolver,
  device(_v, _k, { shared, pointer: { touch = false } = {} }) {
    const sharedConfig = shared;
    if (sharedConfig.target && !SUPPORT.touch && SUPPORT.gesture) return "gesture";
    if (SUPPORT.touch && touch) return "touch";
    if (SUPPORT.touchscreen) {
      if (SUPPORT.pointer) return "pointer";
      if (SUPPORT.touch) return "touch";
    }
  },
  bounds(_v, _k, { scaleBounds = {}, angleBounds = {} }) {
    const _scaleBounds = (state) => {
      const D = assignDefault(call(scaleBounds, state), { min: -Infinity, max: Infinity });
      return [D.min, D.max];
    };
    const _angleBounds = (state) => {
      const A = assignDefault(call(angleBounds, state), { min: -Infinity, max: Infinity });
      return [A.min, A.max];
    };
    if (typeof scaleBounds !== "function" && typeof angleBounds !== "function") return [_scaleBounds(), _angleBounds()];
    return (state) => [_scaleBounds(state), _angleBounds(state)];
  },
  threshold(value, _k, config) {
    this.lockDirection = config.axis === "lock";
    const threshold = V.toVector(value, this.lockDirection ? [0.1, 3] : 0);
    return threshold;
  },
  modifierKey(value) {
    if (value === void 0) return "ctrlKey";
    return value;
  },
  pinchOnWheel(value = true) {
    return value;
  }
};

// packages/core/src/actions.ts
var EngineMap = /* @__PURE__ */ new Map();
var ConfigResolverMap = /* @__PURE__ */ new Map();
function registerAction(action) {
  EngineMap.set(action.key, action.engine);
  ConfigResolverMap.set(action.key, action.resolver);
}
var dragAction = {
  key: "drag",
  engine: DragEngine,
  resolver: dragConfigResolver
};
var pinchAction = {
  key: "pinch",
  engine: PinchEngine,
  resolver: pinchConfigResolver
};

// packages/core/src/config/sharedConfigResolver.ts
var sharedConfigResolver = {
  target(value) {
    if (value) {
      return () => "current" in value ? value.current : value;
    }
    return void 0;
  },
  enabled(value = true) {
    return value;
  },
  window(value = SUPPORT.isBrowser ? window : void 0) {
    return value;
  },
  eventOptions({ passive = true, capture = false } = {}) {
    return { passive, capture };
  },
  transform(value) {
    return value;
  }
};

// packages/core/src/config/resolver.ts
function resolveWith(config = {}, resolvers) {
  const result = {};
  for (const [key, resolver] of Object.entries(resolvers)) {
    switch (typeof resolver) {
      case "function":
        if (false) {
          const r = resolver.call(result, config[key], key, config);
          if (!Number.isNaN(r)) result[key] = r;
        } else {
          result[key] = resolver.call(result, config[key], key, config);
        }
        break;
      case "object":
        result[key] = resolveWith(config[key], resolver);
        break;
      case "boolean":
        if (resolver) result[key] = config[key];
        break;
    }
  }
  return result;
}
function parse(newConfig, gestureKey, _config = {}) {
  const { target, eventOptions, window: window2, enabled, transform, ...rest } = newConfig;
  _config.shared = resolveWith({ target, eventOptions, window: window2, enabled, transform }, sharedConfigResolver);
  if (gestureKey) {
    const resolver = ConfigResolverMap.get(gestureKey);
    _config[gestureKey] = resolveWith({ shared: _config.shared, ...rest }, resolver);
  } else {
    for (const key in rest) {
      const resolver = ConfigResolverMap.get(key);
      if (resolver) {
        _config[key] = resolveWith({ shared: _config.shared, ...rest[key] }, resolver);
      } else if (false) {
        if (!["drag", "pinch", "scroll", "wheel", "move", "hover"].includes(key)) {
          if (key === "domTarget") {
            throw Error(`[@use-gesture]: \`domTarget\` option has been renamed to \`target\`.`);
          }
          console.warn(
            `[@use-gesture]: Unknown config key \`${key}\` was used. Please read the documentation for further information.`
          );
        }
      }
    }
  }
  return _config;
}

// packages/core/src/EventStore.ts
var EventStore = class {
  constructor(ctrl, gestureKey) {
    __publicField(this, "_listeners", /* @__PURE__ */ new Set());
    __publicField(this, "_ctrl");
    __publicField(this, "_gestureKey");
    this._ctrl = ctrl;
    this._gestureKey = gestureKey;
  }
  add(element, device, action, handler, options) {
    const listeners = this._listeners;
    const type = toDomEventType(device, action);
    const _options = this._gestureKey ? this._ctrl.config[this._gestureKey].eventOptions : {};
    const eventOptions = { ..._options, ...options };
    element.addEventListener(type, handler, eventOptions);
    const remove = () => {
      element.removeEventListener(type, handler, eventOptions);
      listeners.delete(remove);
    };
    listeners.add(remove);
    return remove;
  }
  clean() {
    this._listeners.forEach((remove) => remove());
    this._listeners.clear();
  }
};

// packages/core/src/TimeoutStore.ts
var TimeoutStore = class {
  constructor() {
    __publicField(this, "_timeouts", /* @__PURE__ */ new Map());
  }
  add(key, callback, ms = 140, ...args) {
    this.remove(key);
    this._timeouts.set(key, window.setTimeout(callback, ms, ...args));
  }
  remove(key) {
    const timeout = this._timeouts.get(key);
    if (timeout) window.clearTimeout(timeout);
  }
  clean() {
    this._timeouts.forEach((timeout) => void window.clearTimeout(timeout));
    this._timeouts.clear();
  }
};

// packages/core/src/Controller.ts
var Controller = class {
  constructor(handlers) {
    /**
     * The list of gestures handled by the Controller.
     */
    __publicField(this, "gestures", /* @__PURE__ */ new Set());
    /**
     * The event store that keeps track of the config.target listeners.
     */
    __publicField(this, "_targetEventStore", new EventStore(this));
    /**
     * Object that keeps track of all gesture event listeners.
     */
    __publicField(this, "gestureEventStores", {});
    __publicField(this, "gestureTimeoutStores", {});
    __publicField(this, "handlers", {});
    __publicField(this, "nativeHandlers");
    __publicField(this, "config", {});
    __publicField(this, "pointerIds", /* @__PURE__ */ new Set());
    __publicField(this, "touchIds", /* @__PURE__ */ new Set());
    __publicField(this, "state", {
      shared: {
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false
      }
    });
    resolveGestures(this, handlers);
  }
  /**
   * Sets pointer or touch ids based on the event.
   * @param event
   */
  setEventIds(event) {
    if (isTouch(event)) {
      this.touchIds = new Set(touchIds(event));
      return this.touchIds;
    } else if ("pointerId" in event) {
      if (event.type === "pointerup" || event.type === "pointercancel") this.pointerIds.delete(event.pointerId);
      else if (event.type === "pointerdown") this.pointerIds.add(event.pointerId);
      return this.pointerIds;
    }
  }
  /**
   * Attaches handlers to the controller.
   * @param handlers
   * @param nativeHandlers
   */
  applyHandlers(handlers, nativeHandlers) {
    this.handlers = handlers;
    this.nativeHandlers = nativeHandlers;
  }
  /**
   * Compute and attaches a config to the controller.
   * @param config
   * @param gestureKey
   */
  applyConfig(config, gestureKey) {
    this.config = parse(config, gestureKey, this.config);
  }
  /**
   * Cleans all side effects (listeners, timeouts). When the gesture is
   * destroyed (in React, when the component is unmounted.)
   */
  clean() {
    this._targetEventStore.clean();
    for (const key of this.gestures) {
      this.gestureEventStores[key].clean();
      this.gestureTimeoutStores[key].clean();
    }
  }
  /**
   * Executes side effects (attaching listeners to a `config.target`). Ran on
   * each render.
   */
  effect() {
    if (this.config.shared.target) this.bind();
    return () => this._targetEventStore.clean();
  }
  /**
   * The bind function that can be returned by the gesture handler (a hook in
   * React for example.)
   * @param args
   */
  bind(...args) {
    const sharedConfig = this.config.shared;
    const props = {};
    let target;
    if (sharedConfig.target) {
      target = sharedConfig.target();
      if (!target) return;
    }
    if (sharedConfig.enabled) {
      for (const gestureKey of this.gestures) {
        const gestureConfig = this.config[gestureKey];
        const bindFunction = bindToProps(props, gestureConfig.eventOptions, !!target);
        if (gestureConfig.enabled) {
          const Engine2 = EngineMap.get(gestureKey);
          new Engine2(this, args, gestureKey).bind(bindFunction);
        }
      }
      const nativeBindFunction = bindToProps(props, sharedConfig.eventOptions, !!target);
      for (const eventKey in this.nativeHandlers) {
        nativeBindFunction(
          eventKey,
          "",
          // @ts-ignore
          (event) => this.nativeHandlers[eventKey]({ ...this.state.shared, event, args }),
          void 0,
          true
        );
      }
    }
    for (const handlerProp in props) {
      props[handlerProp] = chain(...props[handlerProp]);
    }
    if (!target) return props;
    for (const handlerProp in props) {
      const { device, capture, passive } = parseProp(handlerProp);
      this._targetEventStore.add(target, device, "", props[handlerProp], { capture, passive });
    }
  }
};
function setupGesture(ctrl, gestureKey) {
  ctrl.gestures.add(gestureKey);
  ctrl.gestureEventStores[gestureKey] = new EventStore(ctrl, gestureKey);
  ctrl.gestureTimeoutStores[gestureKey] = new TimeoutStore();
}
function resolveGestures(ctrl, internalHandlers) {
  if (internalHandlers.drag) setupGesture(ctrl, "drag");
  if (internalHandlers.wheel) setupGesture(ctrl, "wheel");
  if (internalHandlers.scroll) setupGesture(ctrl, "scroll");
  if (internalHandlers.move) setupGesture(ctrl, "move");
  if (internalHandlers.pinch) setupGesture(ctrl, "pinch");
  if (internalHandlers.hover) setupGesture(ctrl, "hover");
}
var bindToProps = (props, eventOptions, withPassiveOption) => (device, action, handler, options = {}, isNative = false) => {
  var _a, _b;
  const capture = (_a = options.capture) != null ? _a : eventOptions.capture;
  const passive = (_b = options.passive) != null ? _b : eventOptions.passive;
  let handlerProp = isNative ? device : toHandlerProp(device, action, capture);
  if (withPassiveOption && passive) handlerProp += "Passive";
  props[handlerProp] = props[handlerProp] || [];
  props[handlerProp].push(handler);
};

// engine/src/effects/host.ts
var registered = false;
function ensureActions() {
  if (registered) return;
  registerAction(dragAction);
  registerAction(pinchAction);
  registered = true;
}
var GestureHost = class {
  constructor(target, kind, handler, config = {}) {
    this.disposer = new Disposer("gesture-host");
    ensureActions();
    this.kind = kind;
    const handlers = {};
    handlers[kind] = handler;
    this.ctrl = new Controller(handlers);
    this.ctrl.applyHandlers(handlers);
    this.ctrl.applyConfig({ ...config, target, ...deviceHint() }, kind);
    this.ctrl.effect();
    this.disposer.onDispose(() => this.ctrl.clean());
  }
  /** Re-apply configuration without leaking the previous listener set. */
  reconfigure(config, target) {
    this.ctrl.clean();
    this.ctrl.applyConfig({ ...config, target }, this.kind);
    this.ctrl.effect();
  }
  get alive() {
    return !this.disposer.disposed;
  }
  destroy() {
    this.disposer.dispose();
    this.ctrl.pointerIds.clear();
    this.ctrl.touchIds.clear();
  }
};
function deviceHint() {
  if (typeof window === "undefined") return {};
  return "PointerEvent" in window ? { device: "pointer" } : {};
}

// engine/src/effects/elastic-drag.ts
var ElasticDrag = class {
  constructor(el, options, ctx) {
    this.scope = new Disposer("elastic-drag");
    this.host = null;
    this.machine = new InteractionMachine();
    this.pos = { x: 0, y: 0 };
    this.startPos = { x: 0, y: 0 };
    this.vel = { x: 0, y: 0 };
    this.decayX = null;
    this.decayY = null;
    this.mode = "idle";
    this.removeFrame = null;
    this.activePointer = null;
    this.offRevoke = null;
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    this.el = el;
    this.engine = ctx;
    this.owner = `drag:${Math.random().toString(36).slice(2, 8)}`;
    this.writer = new MotionWriter(el);
    this.opts = {
      axis: (_a = options.axis) != null ? _a : "both",
      overscroll: (_b = options.overscroll) != null ? _b : 0.15,
      friction: (_c = options.friction) != null ? _c : 5,
      flingThreshold: (_d = options.flingThreshold) != null ? _d : 260,
      snapThreshold: (_e = options.snapThreshold) != null ? _e : 60,
      scaleWhileDrag: (_f = options.scaleWhileDrag) != null ? _f : 1,
      threshold: (_g = options.threshold) != null ? _g : 3,
      disabled: (_h = options.disabled) != null ? _h : false,
      bounds: (_i = options.bounds) != null ? _i : {},
      snap: options.snap,
      returnSpring: (_j = options.returnSpring) != null ? _j : SPRING_PRESETS.loose,
      onStart: options.onStart,
      onMove: options.onMove,
      onEnd: options.onEnd,
      onCancel: options.onCancel
    };
    this.springX = new Spring(0, this.opts.returnSpring);
    this.springY = new Spring(0, this.opts.returnSpring);
    this.createHost();
    this.watchDetachment();
    this.offRevoke = ctx.arbiter.onRevoke(this.owner, () => this.abort("preempted"));
  }
  get phase() {
    return this.machine.phase;
  }
  get position() {
    return { ...this.pos };
  }
  /** Transition history, newest last — surfaced by the demo inspector. */
  get history() {
    return this.machine.history;
  }
  get rejectedTransitions() {
    return this.machine.rejectedTransitions;
  }
  createHost() {
    this.host = new GestureHost(
      this.el,
      "drag",
      (state) => this.onDrag(state),
      {
        axis: this.opts.axis === "lock" ? "lock" : this.opts.axis === "both" ? void 0 : this.opts.axis,
        // Bounds and rubber band are applied by this engine, not upstream, so
        // that the elasticity is shared with the scroll container. Passing them
        // to upstream as well would compress the overshoot twice.
        threshold: this.opts.threshold,
        filterTaps: true
        // `preventScroll` is deliberately NOT forwarded: it makes upstream call
        // `preventDefault` from a non-passive `touchmove` listener and delays the
        // gesture start by 250 ms on touch. `touch-action` (applied below) is the
        // modern equivalent and costs nothing on the scroll thread.
      }
    );
  }
  onDrag(state) {
    var _a, _b, _c, _d, _e, _f;
    if (this.opts.disabled) return;
    if (state.first) {
      const id = (_b = (_a = state.event) == null ? void 0 : _a.pointerId) != null ? _b : 0;
      if (!this.engine.arbiter.claim(id, this.owner, PRIORITY.drag)) return;
      this.activePointer = id;
      applyTouchAction(this.el, this.opts.axis, this.scope, this.engine.caps.touch);
      this.el.setAttribute("data-kinetic-drag", "active");
      this.startPos = { ...this.pos };
      this.mode = "drag";
      this.machine.to("press", "pointer-down");
      this.machine.to("drag", "threshold-passed");
      this.writer.write(this.pos.x, this.pos.y, this.opts.scaleWhileDrag);
      (_d = (_c = this.opts).onStart) == null ? void 0 : _d.call(_c, { ...this.pos });
    }
    if (!this.machine.is("drag")) return;
    const rawX = this.startPos.x + state.offset[0];
    const rawY = this.startPos.y + state.offset[1];
    const bx = this.boundsFor("x");
    const by = this.boundsFor("y");
    this.pos.x = rubberbandPosition(rawX, bx.min, bx.max, this.opts.overscroll);
    this.pos.y = rubberbandPosition(rawY, by.min, by.max, this.opts.overscroll);
    if (this.opts.axis === "x") this.pos.y = this.startPos.y;
    if (this.opts.axis === "y") this.pos.x = this.startPos.x;
    if (!Number.isFinite(this.pos.x) || !Number.isFinite(this.pos.y)) {
      this.pos = { ...this.startPos };
      this.abort("non-finite-position");
      return;
    }
    this.writer.write(this.pos.x, this.pos.y, this.opts.scaleWhileDrag);
    (_f = (_e = this.opts).onMove) == null ? void 0 : _f.call(_e, { ...this.pos, phase: this.machine.phase });
    if (state.last) this.onRelease(state);
  }
  onRelease(state) {
    const vx = perMsToPerSec(state.velocity[0]) * sign(state.direction[0] || 0);
    const vy = perMsToPerSec(state.velocity[1]) * sign(state.direction[1] || 0);
    this.vel = { x: vx, y: vy };
    this.el.removeAttribute("data-kinetic-drag");
    if (this.activePointer !== null) this.engine.arbiter.release(this.activePointer, this.owner);
    this.activePointer = null;
    this.writer.write(this.pos.x, this.pos.y, 1);
    const policy = this.engine.motion.policy;
    if (!policy.allowInertia) {
      this.settleNow();
      this.finish(false);
      this.machine.to("settle", "reduced-motion");
      this.machine.to("idle", "settled");
      return;
    }
    const outX = this.pos.x < this.boundsFor("x").min || this.pos.x > this.boundsFor("x").max;
    const outY = this.pos.y < this.boundsFor("y").min || this.pos.y > this.boundsFor("y").max;
    const fastX = Math.abs(vx) > this.opts.flingThreshold;
    const fastY = Math.abs(vy) > this.opts.flingThreshold;
    if (outX || outY) {
      this.beginSpring();
      this.machine.to("settle", "overscroll-return");
      suppressClick(this.scope);
      return;
    }
    if (fastX || fastY) {
      const projected = clampMomentum(this.pos.x, vx, this.boundsFor("x").min, this.boundsFor("x").max, this.opts.friction);
      this.decayX = new Decay(projected.velocity, this.opts.friction);
      this.vel.x = projected.velocity;
      const projectedY = clampMomentum(this.pos.y, vy, this.boundsFor("y").min, this.boundsFor("y").max, this.opts.friction);
      this.decayY = new Decay(projectedY.velocity, this.opts.friction);
      this.vel.y = projectedY.velocity;
      this.mode = "inertia";
      this.machine.to("inertia", "fling");
      this.ensureFrame();
      suppressClick(this.scope);
      return;
    }
    if (this.opts.snap) {
      this.beginSpring();
      this.machine.to("settle", "snap");
      suppressClick(this.scope);
      return;
    }
    this.finish(false);
    this.machine.to("idle", "rest");
  }
  beginSpring() {
    this.mode = "settle";
    const bx = this.boundsFor("x");
    const by = this.boundsFor("y");
    const targetX = this.snapTarget("x", clamp(this.pos.x, bx.min, bx.max));
    const targetY = this.snapTarget("y", clamp(this.pos.y, by.min, by.max));
    this.springX.jump(this.pos.x);
    this.springY.jump(this.pos.y);
    this.springX.setTarget(targetX);
    this.springY.setTarget(targetY);
    this.ensureFrame();
  }
  snapTarget(axis, fallback) {
    var _a;
    const points = (_a = this.opts.snap) == null ? void 0 : _a[axis];
    if (!points || points.length === 0) return fallback;
    const value = axis === "x" ? this.pos.x : this.pos.y;
    const candidate = nearest(value, points);
    return Math.abs(candidate - value) <= this.opts.snapThreshold ? candidate : fallback;
  }
  settleNow() {
    const bx = this.boundsFor("x");
    const by = this.boundsFor("y");
    this.pos.x = this.snapTarget("x", clamp(this.pos.x, bx.min, bx.max));
    this.pos.y = this.snapTarget("y", clamp(this.pos.y, by.min, by.max));
    this.writer.write(this.pos.x, this.pos.y, 1);
    this.mode = "idle";
    this.stopFrame();
  }
  ensureFrame() {
    if (this.removeFrame) return;
    this.removeFrame = this.engine.loop.add((info) => this.tick(info.dtSec), 5);
  }
  stopFrame() {
    var _a;
    (_a = this.removeFrame) == null ? void 0 : _a.call(this);
    this.removeFrame = null;
  }
  tick(dtSec) {
    var _a, _b, _c, _d;
    if (this.mode === "inertia") {
      const dx = (_b = (_a = this.decayX) == null ? void 0 : _a.step(dtSec)) != null ? _b : 0;
      const dy = (_d = (_c = this.decayY) == null ? void 0 : _c.step(dtSec)) != null ? _d : 0;
      const bx = this.boundsFor("x");
      const by = this.boundsFor("y");
      this.pos.x = clamp(this.pos.x + dx, bx.min, bx.max);
      this.pos.y = clamp(this.pos.y + dy, by.min, by.max);
      this.writer.write(this.pos.x, this.pos.y, 1);
      const doneX = !this.decayX || this.decayX.done;
      const doneY = !this.decayY || this.decayY.done;
      const atEdgeX = this.pos.x === bx.min || this.pos.x === bx.max;
      const atEdgeY = this.pos.y === by.min || this.pos.y === by.max;
      if ((doneX || atEdgeX) && (doneY || atEdgeY)) {
        this.decayX = null;
        this.decayY = null;
        if (this.opts.snap) {
          this.beginSpring();
          this.machine.to("settle", "post-inertia-snap");
        } else {
          this.finish(true);
          this.machine.to("idle", "inertia-end");
        }
      }
      return;
    }
    if (this.mode === "settle") {
      this.pos.x = this.springX.step(dtSec);
      this.pos.y = this.springY.step(dtSec);
      this.writer.write(this.pos.x, this.pos.y, 1);
      if (this.springX.settled && this.springY.settled) {
        this.finish(false);
        this.machine.to("idle", "settled");
      }
    }
  }
  finish(flung) {
    var _a, _b;
    this.mode = "idle";
    this.stopFrame();
    (_b = (_a = this.opts).onEnd) == null ? void 0 : _b.call(_a, { ...this.pos, vx: this.vel.x, vy: this.vel.y, flung });
    this.vel = { x: 0, y: 0 };
  }
  /** Abort without momentum — used for pointercancel, revoke, detach, teardown. */
  abort(reason) {
    var _a, _b;
    if (this.machine.is("idle")) return;
    this.machine.to("cancelled", reason);
    this.mode = "idle";
    this.decayX = null;
    this.decayY = null;
    this.stopFrame();
    this.el.removeAttribute("data-kinetic-drag");
    if (this.activePointer !== null) this.engine.arbiter.release(this.activePointer, this.owner);
    this.activePointer = null;
    this.settleNow();
    (_b = (_a = this.opts).onCancel) == null ? void 0 : _b.call(_a, reason);
    this.machine.to("idle", "aborted");
  }
  /**
   * A component that unmounts while its element is being dragged never receives
   * `pointerup`. Upstream keeps running because it has no liveness check; here the
   * element is watched and the drag is aborted the moment it leaves the document.
   */
  watchDetachment() {
    if (typeof MutationObserver === "undefined") return;
    const mo = new MutationObserver(() => {
      if (!this.el.isConnected && !this.machine.is("idle")) this.abort("detached");
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    this.scope.onDispose(() => mo.disconnect());
  }
  boundsFor(axis) {
    const b = this.opts.bounds[axis];
    return b != null ? b : { min: -Infinity, max: Infinity };
  }
  /**
   * Replace the movement bounds — needed whenever the stage resizes, since bounds
   * are expressed in the element's own offset space and a responsive layout
   * changes that space without the engine noticing.
   */
  setBounds(bounds) {
    this.opts.bounds = bounds;
    const bx = this.boundsFor("x");
    const by = this.boundsFor("y");
    this.pos.x = Math.min(Math.max(this.pos.x, bx.min), bx.max);
    this.pos.y = Math.min(Math.max(this.pos.y, by.min), by.max);
    this.writer.write(this.pos.x, this.pos.y, 1);
  }
  setDisabled(disabled) {
    this.opts.disabled = disabled;
    if (disabled) this.abort("disabled");
  }
  /** Programmatic move (used by the demo's "reset" button). */
  moveTo(x, y, animate = true) {
    if (!animate || this.engine.reduced) {
      this.pos = { x, y };
      this.writer.write(x, y, 1);
      return;
    }
    this.springX.jump(this.pos.x);
    this.springY.jump(this.pos.y);
    this.springX.setTarget(x);
    this.springY.setTarget(y);
    this.mode = "settle";
    this.machine.to("settle", "programmatic");
    this.ensureFrame();
  }
  destroy() {
    var _a, _b;
    this.abort("destroy");
    (_a = this.offRevoke) == null ? void 0 : _a.call(this);
    (_b = this.host) == null ? void 0 : _b.destroy();
    this.stopFrame();
    this.scope.dispose();
    this.writer.reset();
    this.el.removeAttribute("data-kinetic-drag");
  }
};

// engine/src/effects/inertial-scroll.ts
var InertialScroll = class {
  constructor(container, content, options, ctx) {
    this.scope = new Disposer("inertial-scroll");
    this.pos = 0;
    this.target = 0;
    this.decay = null;
    this.max = 0;
    this.removeFrame = null;
    this.host = null;
    this.dragging = false;
    this.dragStart = 0;
    this.dragStartPos = 0;
    this.snapPoints = [];
    this.snapTimer = null;
    /**
     * Snap only after a user-driven scroll settles. Programmatic scrolls (the
     * `scrollTo` API and focus-into-view) must be allowed to land between snap
     * points — otherwise mandatory snapping drags a focused field straight back
     * off screen and the caret becomes invisible.
     */
    this.snapAfterSettle = false;
    this.modeScope = new Disposer("scroll-mode");
    var _a, _b, _c, _d, _e, _f;
    this.container = container;
    this.content = content;
    this.engine = ctx;
    this.opts = {
      mode: (_a = options.mode) != null ? _a : "native",
      friction: (_b = options.friction) != null ? _b : 6,
      wheelMultiplier: (_c = options.wheelMultiplier) != null ? _c : 1,
      snapMode: (_d = options.snapMode) != null ? _d : "mandatory",
      snapThreshold: (_e = options.snapThreshold) != null ? _e : 48,
      enabled: (_f = options.enabled) != null ? _f : true,
      snap: options.snap,
      onScroll: options.onScroll
    };
    this.mode = this.opts.mode === "virtual" && !ctx.reduced ? "virtual" : "native";
    this.spring = new Spring(0, SPRING_PRESETS.crisp);
    this.measure();
    this.bind();
    this.applyMode();
    ctx.motion.subscribe(() => {
      const next = this.opts.mode === "virtual" && !ctx.reduced ? "virtual" : "native";
      if (next !== this.mode) {
        this.mode = next;
        this.applyMode();
      }
    });
  }
  get position() {
    return this.mode === "virtual" ? this.pos : this.container.scrollTop;
  }
  get maxScroll() {
    return this.max;
  }
  get currentMode() {
    return this.mode;
  }
  measure() {
    const contentHeight = this.content.scrollHeight || this.content.getBoundingClientRect().height;
    const viewport = this.container.clientHeight;
    this.max = Math.max(0, contentHeight - viewport);
    this.resolveSnapPoints();
  }
  resolveSnapPoints() {
    const snap = this.opts.snap;
    if (!snap) {
      this.snapPoints = [];
      return;
    }
    if (Array.isArray(snap)) {
      this.snapPoints = snap.slice().sort((a, b) => a - b);
      return;
    }
    const containerTop = this.container.getBoundingClientRect().top;
    this.snapPoints = Array.from(this.content.querySelectorAll(snap)).map((el) => el.getBoundingClientRect().top - containerTop + this.position).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  }
  bind() {
    const scope = this.scope;
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => {
        this.measure();
        if (this.mode === "virtual") this.clampTarget();
      });
      ro.observe(this.content);
      ro.observe(this.container);
      scope.onDispose(() => ro.disconnect());
    }
    scope.listen(this.container, "scroll", () => {
      var _a, _b;
      if (this.mode !== "native") return;
      (_b = (_a = this.opts).onScroll) == null ? void 0 : _b.call(_a, { position: this.container.scrollTop, max: this.max, phase: "scroll" });
      this.scheduleNativeSnap();
    }, { passive: true });
    scope.listen(this.container, "wheel", (event) => this.onWheel(event), { passive: false });
    scope.listen(this.container, "keydown", (event) => this.onKey(event));
    scope.listen(this.container, "focusin", (event) => this.onFocusIn(event));
  }
  applyMode() {
    this.modeScope.dispose();
    this.modeScope = new Disposer("scroll-mode");
    if (this.mode === "virtual") {
      const nativePosition = this.container.scrollTop;
      this.modeScope.style(this.container, "overflow", "hidden");
      this.modeScope.style(this.container, "overscroll-behavior", "contain");
      applyTouchAction(this.container, "y", this.modeScope, this.engine.caps.touch);
      this.modeScope.style(this.content, "will-change", "transform");
      this.pos = Math.min(nativePosition, this.max);
      this.target = this.pos;
      this.spring.jump(this.pos);
      this.write();
      this.createDragHost();
    } else {
      this.teardownDragHost();
      this.content.style.removeProperty("transform");
      this.content.style.removeProperty("will-change");
    }
  }
  createDragHost() {
    if (this.host) return;
    this.host = new GestureHost(
      this.container,
      "drag",
      (state) => this.onDrag(state),
      { axis: "y", threshold: 2, filterTaps: true, preventScroll: true }
    );
  }
  teardownDragHost() {
    var _a;
    (_a = this.host) == null ? void 0 : _a.destroy();
    this.host = null;
  }
  onWheel(event) {
    if (this.mode !== "virtual" || !this.opts.enabled) return;
    const unit = normalizeWheel(event.deltaY, event.deltaMode, this.container.clientHeight);
    if (unit === 0) return;
    event.preventDefault();
    this.decay = null;
    this.target += unit * this.opts.wheelMultiplier;
    this.snapAfterSettle = true;
    this.clampTarget();
    this.ensureFrame();
  }
  onDrag(state) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (this.mode !== "virtual") return;
    if (!this.opts.enabled) return;
    if (state.first) {
      this.dragging = true;
      this.decay = null;
      this.dragStart = (_b = (_a = state.event) == null ? void 0 : _a.clientY) != null ? _b : 0;
      this.dragStartPos = this.pos;
      return;
    }
    if (!this.dragging) return;
    const dy = ((_d = (_c = state.event) == null ? void 0 : _c.clientY) != null ? _d : this.dragStart) - this.dragStart;
    const raw = this.dragStartPos - dy;
    this.pos = rubberbandPosition(raw, 0, this.max, 0.2);
    this.target = this.pos;
    this.write();
    if (state.last) {
      this.dragging = false;
      const v = -((_f = (_e = state.velocity) == null ? void 0 : _e[1]) != null ? _f : 0) * 1e3 * Math.sign((_h = (_g = state.direction) == null ? void 0 : _g[1]) != null ? _h : 0);
      if (this.engine.motion.policy.allowInertia && Math.abs(v) > 80) {
        this.decay = new Decay(v, this.opts.friction);
        this.ensureFrame();
      } else {
        this.settleToSnap();
      }
    }
  }
  onKey(event) {
    if (this.mode !== "virtual") return;
    const page = this.container.clientHeight * 0.9;
    let next = null;
    switch (event.key) {
      case "ArrowDown":
        next = this.target + 48;
        break;
      case "ArrowUp":
        next = this.target - 48;
        break;
      case "PageDown":
        next = this.target + page;
        break;
      case "PageUp":
        next = this.target - page;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = this.max;
        break;
      default:
        next = null;
    }
    if (next === null) return;
    event.preventDefault();
    this.target = next;
    this.clampTarget();
    this.ensureFrame();
  }
  /**
   * Virtual scrolling has no native `scrollIntoView`, so tabbing into an
   * off-screen field would leave the caret invisible. Focus is the one case
   * where silently broken scrolling becomes an accessibility failure.
   */
  onFocusIn(event) {
    if (this.mode !== "virtual") return;
    const el = event.target;
    if (!el || !this.content.contains(el)) return;
    const containerTop = this.container.getBoundingClientRect().top;
    const rect = el.getBoundingClientRect();
    const top = rect.top - containerTop + this.pos;
    const bottom = top + rect.height;
    if (top < this.pos) {
      this.target = top;
    } else if (bottom > this.pos + this.container.clientHeight) {
      this.target = bottom - this.container.clientHeight;
    } else {
      return;
    }
    this.clampTarget();
    this.ensureFrame();
  }
  clampTarget() {
    this.target = clamp(this.target, 0, this.max);
  }
  ensureFrame() {
    if (this.removeFrame) return;
    this.removeFrame = this.engine.loop.add((info) => this.tick(info.dtSec), 5);
  }
  tick(dtSec) {
    var _a;
    if (this.dragging) {
      this.write();
      return;
    }
    if (this.decay) {
      const delta = this.decay.step(dtSec);
      this.pos += delta;
      if (this.pos <= 0 || this.pos >= this.max) {
        this.pos = clamp(this.pos, 0, this.max);
        this.decay = null;
        this.settleToSnap();
      } else if (this.decay.done) {
        this.decay = null;
        this.settleToSnap();
      }
      this.target = this.pos;
      this.write();
      return;
    }
    this.spring.setTarget(this.target);
    this.pos = this.spring.step(dtSec);
    this.write();
    if (this.spring.settled) {
      this.pos = this.target;
      this.write();
      const snapped = this.snapAfterSettle ? this.snapPointFor(this.pos) : null;
      if (snapped !== null && Math.abs(snapped - this.pos) > 0.5) {
        this.target = snapped;
        return;
      }
      this.snapAfterSettle = false;
      (_a = this.removeFrame) == null ? void 0 : _a.call(this);
      this.removeFrame = null;
    }
  }
  settleToSnap() {
    this.snapAfterSettle = false;
    if (this.snapPoints.length === 0) {
      this.target = clamp(this.pos, 0, this.max);
    } else {
      let best = this.pos;
      let bestD = Infinity;
      for (const p of this.snapPoints) {
        const d = Math.abs(p - this.pos);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      const within = this.opts.snapMode === "mandatory" || bestD <= this.opts.snapThreshold;
      this.target = within ? best : clamp(this.pos, 0, this.max);
    }
    if (this.engine.reduced) {
      this.pos = this.target;
      this.write();
      return;
    }
    this.ensureFrame();
  }
  snapPointFor(position) {
    if (this.snapPoints.length === 0) return null;
    let best = null;
    let bestD = Infinity;
    for (const p of this.snapPoints) {
      const d = Math.abs(p - position);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (best === null) return null;
    if (this.opts.snapMode === "mandatory") return clamp(best, 0, this.max);
    return bestD <= this.opts.snapThreshold ? clamp(best, 0, this.max) : null;
  }
  write() {
    var _a, _b;
    this.content.style.transform = `translate3d(0, ${-Math.round(this.pos * 100) / 100}px, 0)`;
    (_b = (_a = this.opts).onScroll) == null ? void 0 : _b.call(_a, { position: this.pos, max: this.max, phase: this.dragging ? "drag" : this.decay ? "inertia" : "settle" });
  }
  /**
   * Native-mode snap assist. Debounced instead of using `scrollend`, which is
   * still missing in Safari; the debounce is also what makes it work for
   * trackpad inertia, where `scrollend` fires once per gesture but the event
   * stream pauses mid-flick.
   */
  scheduleNativeSnap() {
    var _a;
    if (!this.opts.snap || this.snapPoints.length === 0) return;
    (_a = this.snapTimer) == null ? void 0 : _a.call(this);
    this.snapTimer = this.scope.timeout(() => {
      const current = this.container.scrollTop;
      let best = current;
      let bestD = Infinity;
      for (const p of this.snapPoints) {
        const d = Math.abs(p - current);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      if (bestD > 4 && bestD <= this.opts.snapThreshold) {
        this.container.scrollTo({
          top: clamp(best, 0, this.max),
          behavior: this.engine.reduced ? "auto" : "smooth"
        });
      }
    }, 140);
  }
  scrollTo(position, immediate = false) {
    const next = clamp(position, 0, this.max);
    if (this.mode === "native") {
      this.container.scrollTo({ top: next, behavior: immediate || this.engine.reduced ? "auto" : "smooth" });
      return;
    }
    this.target = next;
    if (immediate) {
      this.pos = next;
      this.spring.jump(next);
      this.write();
      return;
    }
    this.ensureFrame();
  }
  setMode(mode) {
    this.opts.mode = mode;
    this.mode = mode === "virtual" && !this.engine.reduced ? "virtual" : "native";
    this.applyMode();
  }
  setEnabled(enabled) {
    this.opts.enabled = enabled;
    this.decay = null;
  }
  destroy() {
    var _a;
    (_a = this.removeFrame) == null ? void 0 : _a.call(this);
    this.removeFrame = null;
    this.teardownDragHost();
    this.modeScope.dispose();
    this.scope.dispose();
  }
};

// engine/src/effects/gestures.ts
var GestureRecognizer = class {
  constructor(el, options, ctx) {
    this.scope = new Disposer("gestures");
    this.machine = new InteractionMachine();
    this.pointers = /* @__PURE__ */ new Map();
    this.longPressTimer = null;
    this.tapTimer = null;
    this.lastTap = null;
    this.pinchStart = 0;
    this.pinchActive = false;
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    this.el = el;
    this.engine = ctx;
    this.opts = {
      tapMaxDistance: (_a = options.tapMaxDistance) != null ? _a : 12,
      tapMaxDuration: (_b = options.tapMaxDuration) != null ? _b : 260,
      doubleTapWindow: (_c = options.doubleTapWindow) != null ? _c : 320,
      longPressDuration: (_d = options.longPressDuration) != null ? _d : 500,
      swipeMinDistance: (_e = options.swipeMinDistance) != null ? _e : 44,
      swipeMinVelocity: (_f = options.swipeMinVelocity) != null ? _f : 320,
      moveCancelThreshold: (_g = options.moveCancelThreshold) != null ? _g : 8,
      capturePinch: (_h = options.capturePinch) != null ? _h : false,
      disabled: (_i = options.disabled) != null ? _i : false,
      tap: options.tap,
      doubleTap: options.doubleTap,
      longPress: options.longPress,
      swipe: options.swipe,
      pinch: options.pinch
    };
    this.bind();
  }
  get phase() {
    return this.machine.phase;
  }
  bind() {
    const scope = this.scope;
    scope.listen(this.el, "pointerdown", (event) => this.onDown(event));
    scope.listen(this.el, "pointermove", (event) => this.onMove(event));
    scope.listen(this.el, "pointerup", (event) => this.onUp(event));
    scope.listen(this.el, "pointercancel", (event) => this.onCancel(event));
    scope.listen(this.el, "contextmenu", (event) => {
      if (this.opts.longPress) event.preventDefault();
    });
    if (this.opts.pinch && this.opts.capturePinch) {
      applyTouchAction(this.el, "both", scope, this.engine.caps.touch);
    }
  }
  onDown(event) {
    if (this.opts.disabled) return;
    this.pointers.set(event.pointerId, {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: event.timeStamp,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      moved: false
    });
    if (this.pointers.size === 2 && this.opts.pinch) {
      this.beginPinch();
      this.cancelLongPress();
      return;
    }
    this.machine.to("press", "pointer-down");
    if (this.opts.longPress) {
      this.cancelLongPress();
      this.longPressTimer = this.scope.timeout(() => {
        var _a, _b;
        this.longPressTimer = null;
        if (this.machine.is("press")) {
          this.machine.to("hover", "long-press");
          (_b = (_a = this.opts).longPress) == null ? void 0 : _b.call(_a, { x: event.clientX, y: event.clientY });
          this.machine.to("idle", "long-press-fired");
        }
      }, this.opts.longPressDuration);
    }
  }
  onMove(event) {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    pointer.lastTime = event.timeStamp;
    const moved = distance(event.clientX, event.clientY, pointer.startX, pointer.startY);
    if (moved > this.opts.moveCancelThreshold) {
      pointer.moved = true;
      this.cancelLongPress();
      if (this.machine.is("press")) this.machine.to("drag", "moved");
    }
    if (this.pinchActive && this.pointers.size >= 2) this.updatePinch();
  }
  onUp(event) {
    var _a, _b;
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    this.pointers.delete(event.pointerId);
    this.cancelLongPress();
    if (this.pinchActive) {
      if (this.pointers.size < 2) {
        this.pinchActive = false;
        this.pinchStart = 0;
      }
      if (this.pointers.size === 0) this.machine.to("idle", "pinch-end");
      return;
    }
    const elapsed = event.timeStamp - pointer.startTime;
    const moved = distance(event.clientX, event.clientY, pointer.startX, pointer.startY);
    const dx = event.clientX - pointer.startX;
    const dy = event.clientY - pointer.startY;
    const dt = Math.max(1, event.timeStamp - pointer.startTime);
    const vx = dx / dt * 1e3;
    const vy = dy / dt * 1e3;
    const isSwipe = this.opts.swipe && Math.max(Math.abs(dx), Math.abs(dy)) >= this.opts.swipeMinDistance && Math.max(Math.abs(vx), Math.abs(vy)) >= this.opts.swipeMinVelocity;
    if (isSwipe) {
      const horizontal = Math.abs(dx) > Math.abs(dy);
      (_b = (_a = this.opts).swipe) == null ? void 0 : _b.call(_a, {
        direction: horizontal ? dx > 0 ? "right" : "left" : dy > 0 ? "down" : "up",
        velocity: horizontal ? vx : vy,
        distance: horizontal ? dx : dy
      });
      suppressClick(this.scope);
      this.machine.to("idle", "swipe");
      return;
    }
    if (moved <= this.opts.tapMaxDistance && elapsed <= this.opts.tapMaxDuration) {
      this.handleTap(event);
      return;
    }
    this.machine.to("idle", "no-gesture");
  }
  handleTap(event) {
    var _a, _b, _c, _d;
    const now2 = event.timeStamp;
    const previous = this.lastTap;
    if (previous && this.opts.doubleTap && now2 - previous.time <= this.opts.doubleTapWindow && distance(event.clientX, event.clientY, previous.x, previous.y) <= 32) {
      (_a = this.tapTimer) == null ? void 0 : _a.call(this);
      this.tapTimer = null;
      this.lastTap = null;
      this.machine.to("idle", "double-tap");
      this.opts.doubleTap({ x: event.clientX, y: event.clientY });
      return;
    }
    if (!this.opts.tap && !this.opts.doubleTap) {
      this.machine.to("idle", "tap");
      return;
    }
    this.lastTap = { time: now2, x: event.clientX, y: event.clientY };
    if (this.opts.doubleTap) {
      (_b = this.tapTimer) == null ? void 0 : _b.call(this);
      this.tapTimer = this.scope.timeout(() => {
        var _a2, _b2;
        this.tapTimer = null;
        this.lastTap = null;
        this.machine.to("idle", "tap");
        (_b2 = (_a2 = this.opts).tap) == null ? void 0 : _b2.call(_a2, { x: event.clientX, y: event.clientY });
      }, this.opts.doubleTapWindow);
    } else {
      this.machine.to("idle", "tap");
      (_d = (_c = this.opts).tap) == null ? void 0 : _d.call(_c, { x: event.clientX, y: event.clientY });
    }
  }
  onCancel(event) {
    this.pointers.delete(event.pointerId);
    this.cancelLongPress();
    this.pinchActive = false;
    this.pinchStart = 0;
    if (!this.machine.is("idle")) this.machine.to("cancelled", "pointer-cancel");
    this.machine.to("idle", "cancelled");
  }
  beginPinch() {
    const [a, b] = Array.from(this.pointers.values());
    this.pinchStart = distance(a.startX, a.startY, b.startX, b.startY) || 1;
    this.pinchActive = true;
    this.machine.to("drag", "pinch-start");
  }
  updatePinch() {
    var _a, _b;
    const [a, b] = Array.from(this.pointers.values());
    const d = distance(a.lastX, a.lastY, b.lastX, b.lastY);
    (_b = (_a = this.opts).pinch) == null ? void 0 : _b.call(_a, {
      scale: d / this.pinchStart,
      centerX: (a.lastX + b.lastX) / 2,
      centerY: (a.lastY + b.lastY) / 2
    });
  }
  cancelLongPress() {
    var _a;
    (_a = this.longPressTimer) == null ? void 0 : _a.call(this);
    this.longPressTimer = null;
  }
  setDisabled(disabled) {
    this.opts.disabled = disabled;
    if (disabled) this.onCancel({ pointerId: -1 });
  }
  destroy() {
    var _a;
    this.cancelLongPress();
    (_a = this.tapTimer) == null ? void 0 : _a.call(this);
    this.tapTimer = null;
    this.pointers.clear();
    this.scope.dispose();
  }
};

// engine/src/index.ts
var Kinetic = class {
  constructor(options = {}) {
    this.effects = /* @__PURE__ */ new Set();
    this.disposed = false;
    this.ctx = new EngineContext(options);
  }
  get capabilities() {
    return this.ctx.caps;
  }
  get motionPolicy() {
    return this.ctx.motion.policy;
  }
  /** Change the motion preference at runtime (`auto` follows the OS). */
  setMotion(preference) {
    this.ctx.motion.set(preference);
  }
  /** Force a quality tier instead of the adaptive one. `null` = adaptive. */
  setQuality(tier) {
    this.ctx.loop.forceTier(tier);
  }
  magnetic(el, options = {}) {
    return this.track(new Magnetic(el, options, this.ctx));
  }
  trail(canvas, options = {}) {
    return this.track(new Trail(canvas, options, this.ctx));
  }
  elasticDrag(el, options = {}) {
    return this.track(new ElasticDrag(el, options, this.ctx));
  }
  inertialScroll(container, content, options = {}) {
    return this.track(new InertialScroll(container, content, options, this.ctx));
  }
  gestures(el, options = {}) {
    return this.track(new GestureRecognizer(el, options, this.ctx));
  }
  /** Counters used by the leak tests and the demo's diagnostics panel. */
  diagnostics() {
    return {
      listenersBound: counters.listenersBound,
      listenersReleased: counters.listenersReleased,
      timeoutsCreated: counters.timeoutsCreated,
      timeoutsCleared: counters.timeoutsCleared,
      framesScheduled: counters.framesScheduled,
      rejectedTransitions: 0,
      abortedGestures: 0
    };
  }
  get liveListeners() {
    return liveListenerCount();
  }
  get effectCount() {
    return this.effects.size;
  }
  track(effect) {
    if (this.disposed) {
      effect.destroy();
      return effect;
    }
    this.effects.add(effect);
    const originalDestroy = effect.destroy.bind(effect);
    effect.destroy = () => {
      this.effects.delete(effect);
      originalDestroy();
    };
    return effect;
  }
  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    for (const effect of Array.from(this.effects)) effect.destroy();
    this.effects.clear();
    this.ctx.scope.dispose();
    this.ctx.arbiter.releaseAll();
  }
};
function createKinetic(options = {}) {
  return new Kinetic(options);
}
var index_default = createKinetic;
//# sourceMappingURL=kinetic-engine.cjs.map
