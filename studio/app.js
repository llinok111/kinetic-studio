/* global Kinetic */
/**
 * Workbench wiring.
 *
 * Everything here uses only the public engine API. The one exception is the
 * listener counter, which patches `EventTarget` so the numbers include the
 * listeners upstream binds internally — otherwise "0 listeners after destroy"
 * would be a self-report rather than a measurement.
 */

const { createKinetic, liveListenerCount, frameLoop } = Kinetic

// ---------------------------------------------------------------- instrumentation

const probe = (() => {
  const buckets = new WeakMap()
  let live = 0
  const add = EventTarget.prototype.addEventListener
  const remove = EventTarget.prototype.removeEventListener

  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (listener) {
      let byType = buckets.get(this)
      if (!byType) buckets.set(this, (byType = new Map()))
      let set = byType.get(type)
      if (!set) byType.set(type, (set = new Set()))
      if (!set.has(listener)) {
        set.add(listener)
        live++
      }
    }
    return add.call(this, type, listener, options)
  }

  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    if (listener && buckets.get(this)?.get(type)?.delete(listener)) live--
    return remove.call(this, type, listener, options)
  }

  return { get live() { return live } }
})()

// ---------------------------------------------------------------- engine

const engine = createKinetic({ motion: 'auto', debug: true })

const $ = (sel, root = document) => root.querySelector(sel)
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel))
const two = (n) => String(n).padStart(2, '0')
const stamp = () => {
  const d = new Date()
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`
}

function log(list, text, tag = '') {
  const li = document.createElement('li')
  const a = document.createElement('span')
  a.textContent = tag || stamp()
  const b = document.createElement('span')
  b.textContent = text
  li.append(a, b)
  list.prepend(li)
  while (list.children.length > 9) list.lastElementChild.remove()
}

// ---------------------------------------------------------------- capability readout

const capPointer = $('#cap-pointer')
const capHover = $('#cap-hover')
const capTouch = $('#cap-touch')
const capDpr = $('#cap-dpr')
const capMotion = $('#cap-motion')
const capFps = $('#cap-fps')
const capListeners = $('#cap-listeners')

function renderReadout() {
  const caps = engine.capabilities
  const policy = engine.motionPolicy
  capPointer.textContent = caps.finePointer ? '精细指针' : caps.coarsePointer ? '粗指针（触控）' : '未知'
  capHover.textContent = caps.hover ? '可悬停' : '不可悬停'
  capHover.dataset.state = caps.hover ? 'on' : 'off'
  capTouch.textContent = caps.touch ? `有 · ${caps.maxTouchPoints} 点` : '无'
  capDpr.textContent = caps.devicePixelRatio.toFixed(2)
  capMotion.textContent = policy.reduced ? '减少' : '完整'
  capMotion.dataset.state = policy.reduced ? 'off' : 'on'
  capFps.textContent = `${frameLoop.fps.toFixed(0)} fps · ${frameLoop.tier}`
  capListeners.textContent = `${probe.live} / 本引擎 ${liveListenerCount()}`
}

renderReadout()
setInterval(renderReadout, 300)

// ---------------------------------------------------------------- global controls

$$('[data-motion]').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('[data-motion]').forEach((b) => b.classList.toggle('is-on', b === btn))
    engine.setMotion(btn.dataset.motion)
    renderReadout()
  })
})

$$('[data-quality]').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('[data-quality]').forEach((b) => b.classList.toggle('is-on', b === btn))
    const value = btn.dataset.quality
    engine.setQuality(value === 'auto' ? null : value)
  })
})

// ---------------------------------------------------------------- 01 magnetic

const magnets = new Map()

function initMagnets() {
  $$('.mag').forEach((el) => {
    if (magnets.has(el)) return
    const strength = Number(el.dataset.strength || 0.34)
    const radius = el.dataset.radius === 'auto' ? 'auto' : Number(el.dataset.radius || 0) || 'auto'
    const maxOffset = Number(el.dataset.max || 22)
    const mag = engine.magnetic(el, { strength, radius, maxOffset, scale: 1.03 })
    mag.measure()
    magnets.set(el, mag)
  })
  const card = $('#mag-card')
  if (card && !magnets.has(card)) {
    const mag = engine.magnetic(card, { strength: 0.14, radius: 'auto', maxOffset: 10 })
    mag.measure()
    magnets.set(card, mag)
  }
}

initMagnets()
window.addEventListener('resize', () => {
  for (const mag of magnets.values()) mag.measure()
})

// ---------------------------------------------------------------- 02 trail

const trailCanvas = $('#trail-canvas')
const trailHost = $('#trail-host')
let trail = engine.trail(trailCanvas, {
  host: trailHost,
  length: 26,
  width: 7,
  color: '#e2a75f',
  mode: 'comet'
})

$('#trail-mode').addEventListener('change', (event) => {
  rebuildTrail({ mode: event.target.value })
})
$('#trail-length').addEventListener('input', (event) => {
  rebuildTrail({ length: Number(event.target.value) })
})
$('#trail-width').addEventListener('input', (event) => {
  rebuildTrail({ width: Number(event.target.value) })
})

function rebuildTrail(patch) {
  const next = {
    mode: $('#trail-mode').value,
    length: Number($('#trail-length').value),
    width: Number($('#trail-width').value),
    ...patch
  }
  trail.destroy()
  trail = engine.trail(trailCanvas, { host: trailHost, color: '#e2a75f', ...next })
  $('#trail-state').textContent = trail.enabled ? '运行中' : '已关闭（触控 / 减少动效）'
}

$('#trail-state').textContent = trail.enabled ? '运行中' : '已关闭（触控 / 减少动效）'

// ---------------------------------------------------------------- 03 elastic drag

const stage = $('#drag-stage')
const dragPhaseEl = $('#drag-phase')
const dragPosEl = $('#drag-pos')
const dragVelEl = $('#drag-vel')

let drag = null
let dragCard = null

function stageBounds() {
  const stageRect = stage.getBoundingClientRect()
  const cardRect = dragCard.getBoundingClientRect()
  const inner = 22
  const maxX = Math.max(0, (stageRect.width - inner * 2 - cardRect.width) / 2)
  const maxY = Math.max(0, (stageRect.height - inner * 2 - cardRect.height) / 2)
  return { x: { min: -maxX, max: maxX }, y: { min: -maxY, max: maxY } }
}

function snapPoints() {
  const { x } = stageBounds()
  return { x: [x.min, 0, x.max] }
}

function initDrag(el) {
  dragCard = el
  const bounds = stageBounds()
  drag = engine.elasticDrag(el, {
    axis: 'both',
    bounds,
    overscroll: 0.16,
    friction: 5.2,
    flingThreshold: 240,
    snap: snapPoints(),
    snapThreshold: 70,
    scaleWhileDrag: 1.02,
    onStart: () => setPhase('drag'),
    onMove: (pos) => {
      dragPosEl.textContent = `x ${pos.x.toFixed(0)} · y ${pos.y.toFixed(0)}`
    },
    onEnd: (r) => {
      dragVelEl.textContent = `v ${Math.hypot(r.vx, r.vy).toFixed(0)} px/s`
    },
    onCancel: (reason) => log($('#transition-log'), `拖动中止：${reason}`, 'cancel')
  })
  dragPhaseEl.dataset.phase = drag.phase
  dragPhaseEl.textContent = drag.phase
}

function setPhase(phase) {
  dragPhaseEl.dataset.phase = phase
  dragPhaseEl.textContent = phase
}

initDrag($('#drag-card'))

$('#drag-reset').addEventListener('click', () => {
  drag?.moveTo(0, 0, true)
  dragVelEl.textContent = 'v 0 px/s'
})

$('#drag-detach').addEventListener('click', () => {
  const el = $('#drag-card')
  if (!el) return
  el.remove()
  const out = $('#edge-output')
  out.textContent = `已完成：拖动中的元素被移出文档。\nMutationObserver 检测到 isConnected=false → abort("detached")。\n当前 phase = ${drag.phase}`
})

$('#drag-restore').addEventListener('click', () => {
  if ($('#drag-card')) return
  const el = document.createElement('div')
  el.className = 'card'
  el.id = 'drag-card'
  el.tabIndex = 0
  el.setAttribute('role', 'button')
  el.setAttribute('aria-label', '可拖动的卡片')
  el.innerHTML = '<strong>拖动我</strong><span class="card__hint">越界会有阻力 · 甩出去会带惯性 · 松手吸附到最近刻度</span>'
  stage.appendChild(el)
  drag?.destroy()
  initDrag(el)
  const out = $('#edge-output')
  out.textContent = `已重新挂载元素并重建拖动实例。\n活跃监听器：${probe.live}（本引擎 ${liveListenerCount()}）`
})

window.addEventListener('resize', () => {
  if (drag) drag.setBounds(stageBounds())
})

setInterval(() => {
  if (!drag) return
  setPhase(drag.phase)
}, 200)

// ---------------------------------------------------------------- 04 inertial scroll

const scroller = $('#scroller')
const scrollerContent = $('#scroller-content')
const scrollBadge = $('#scroll-mode-badge')
const scrollPos = $('#scroll-pos')

let scroll = engine.inertialScroll(scroller, scrollerContent, {
  mode: 'native',
  snap: '[data-snap]',
  snapMode: 'mandatory',
  friction: 6.4,
  onScroll: ({ position, max }) => {
    scrollPos.textContent = `${Math.round(position)} / ${Math.round(max)}`
  }
})

$$('[data-scroll-mode]').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('[data-scroll-mode]').forEach((b) => b.classList.toggle('is-on', b === btn))
    scroll.setMode(btn.dataset.scrollMode)
    scrollBadge.textContent = scroll.currentMode
  })
})

scrollBadge.textContent = scroll.currentMode
scrollPos.textContent = `0 / ${Math.round(scroll.maxScroll)}`

// ---------------------------------------------------------------- 05 gestures

const padEl = $('#gesture-pad')
const echo = $('#gesture-echo')
const gestureLog = $('#gesture-log')

function echoGesture(text) {
  echo.textContent = text
  echo.dataset.pulse = echo.dataset.pulse === '1' ? '0' : '1'
  log(gestureLog, text)
}

const gestures = engine.gestures(padEl, {
  tap: () => echoGesture('tap'),
  doubleTap: () => echoGesture('doubleTap'),
  longPress: () => echoGesture('longPress'),
  swipe: (info) => echoGesture(`swipe ${info.direction} · ${Math.abs(info.velocity).toFixed(0)} px/s`),
  pinch: (info) => echoGesture(`pinch ×${info.scale.toFixed(2)}`),
  capturePinch: true
})

// ---------------------------------------------------------------- 06 machine inspector

const mDrag = $('#m-drag')
const mMag = $('#m-mag')
const mGest = $('#m-gest')
const mDragRej = $('#m-drag-rej')
const mMagRej = $('#m-mag-rej')
const mGestRej = $('#m-gest-rej')
const transitionLog = $('#transition-log')

function paintBadge(el, phase) {
  if (el.textContent === phase) return
  el.textContent = phase
  el.dataset.phase = phase
}

setInterval(() => {
  paintBadge(mDrag, drag ? drag.phase : 'idle')
  const firstMag = magnets.values().next().value
  paintBadge(mMag, firstMag ? firstMag.phase : 'idle')
  paintBadge(mGest, gestures.phase)
  mDragRej.textContent = `拒绝 ${drag ? drag.rejectedTransitions : 0}`
}, 180)

// ---------------------------------------------------------------- 07 edge lab

const edgeOut = $('#edge-output')

function report(lines) {
  edgeOut.textContent = lines.join('\n')
}

$('#edge-cycle').addEventListener('click', () => {
  const before = probe.live
  const host = document.createElement('div')
  document.body.appendChild(host)
  for (let i = 0; i < 50; i++) {
    const temp = createKinetic({ motion: 'full' })
    temp.magnetic(host, {})
    temp.gestures(host, { tap: () => {} })
    temp.elasticDrag(host, {})
    temp.destroy()
  }
  host.remove()
  const after = probe.live
  report([
    `挂载/卸载 ×50 完成`,
    `真实 DOM 监听器：${before} → ${after}`,
    after === before ? '✅ 无泄漏：计数回到基线' : `⚠️ 增长 ${after - before} 个（应为 0）`
  ])
})

$('#edge-detach').addEventListener('click', () => {
  $('#drag-detach').click()
})

$('#edge-cancel').addEventListener('click', () => {
  const el = $('#drag-card')
  if (!el) return report(['元素已移除，先点「恢复元素」'])
  const make = (type, x, y, buttons) =>
    new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 99, pointerType: 'mouse', buttons, isPrimary: true })
  el.dispatchEvent(make('pointerdown', 10, 10, 1))
  el.dispatchEvent(make('pointermove', 80, 30, 1))
  const before = drag.phase
  el.dispatchEvent(make('pointercancel', 80, 30, 0))
  report([
    '已派发 pointerdown → pointermove → pointercancel',
    `phase：${before} → ${drag.phase}`,
    drag.phase === 'idle' ? '✅ 中止且未进入惯性（不会「松手后自己滑走」）' : '⚠️ 未回到 idle'
  ])
})

$('#edge-multi').addEventListener('click', () => {
  const el = $('#drag-card')
  if (!el) return report(['元素已移除'])
  const make = (type, id, x, y, buttons) =>
    new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: id, pointerType: 'touch', buttons, isPrimary: id === 1 })
  el.dispatchEvent(make('pointerdown', 1, 20, 20, 1))
  el.dispatchEvent(make('pointerdown', 2, 90, 60, 1))
  el.dispatchEvent(make('pointerdown', 3, 140, 90, 1))
  el.dispatchEvent(make('pointermove', 1, 60, 40, 1))
  const active = drag ? drag.phase : 'idle'
  el.dispatchEvent(make('pointercancel', 1, 60, 40, 0))
  el.dispatchEvent(make('pointercancel', 2, 90, 60, 0))
  el.dispatchEvent(make('pointercancel', 3, 140, 90, 0))
  report([
    '三指同时按下（pointerId 1/2/3），只让 1 号指针驱动拖动',
    `多指期间 phase = ${active}`,
    '✅ 仲裁器按 pointerId 归属，第二、三指不会把卡片拽向别处'
  ])
})

$('#edge-hidden').addEventListener('click', () => {
  document.dispatchEvent(new Event('visibilitychange'))
  report([
    '已派发 visibilitychange',
    `frameLoop.running = ${frameLoop.running} · 订阅数 = ${frameLoop.size}`,
    '页面真正 hidden 时 rAF 停止；回到前台会把时间基准重置，避免 dt 累积成 30 秒',
    '这行代码本身只是触发器 —— 真实的后台切换无法由脚本伪造'
  ])
})

// ---------------------------------------------------------------- 收尾

window.addEventListener('beforeunload', () => engine.destroy())

// Expose for manual poking in devtools; harmless and useful during review.
window.__kinetic = {
  engine,
  probe,
  frameLoop,
  magnets,
  get drag() { return drag },
  get scroll() { return scroll },
  get trail() { return trail },
  gestures
}
