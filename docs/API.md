# API

单位约定先写在最前面，因为混用是这套 API 最常见的接入事故。

| 量 | 单位 | 出现在哪里 |
|---|---|---|
| 位移 | px | `position`、`x`/`y`、`distance` |
| 速度 | **px/s** | 所有公开选项（`flingThreshold`、`swipeMinVelocity`）与回调 |
| 上游 `state.velocity` | **px/ms，且不带符号** | 只在上游内部使用；符号在 `state.direction` |
| 时间 | ms | `FrameInfo.dt`、`PhaseChange.duration` |
| 积分步长 | **s** | `FrameInfo.dtSec`、`Spring.step(dtSec)` |
| 摩擦 | e-folds/s | `friction`：1/friction 秒后速度降到 37% |

上游那个「速度不带符号」是真实的坑：`state.velocity[0]` 恒为正，方向在 `state.direction[0]`。只用前者，每一次甩动都往右下走。引擎在 `elastic-drag.ts` 里完成合成，对外只暴露有符号的 px/s。

---

## 创建

```js
import { createKinetic } from 'kinetic-engine'

const kinetic = createKinetic({
  motion: 'auto',   // 'auto' | 'reduce' | 'full'
  quality: 'auto',  // 'auto' | 'high' | 'mid' | 'low'
  debug: false
})
```

**每页一个实例。** 实例持有共享内核（能力快照、动效策略、帧循环、仲裁器）。两个实例会各跑一条时钟、各做一套仲裁——这正是内核要消除的不一致。

| 成员 | 说明 |
|---|---|
| `kinetic.capabilities` | `{ finePointer, coarsePointer, hover, touch, maxTouchPoints, reducedMotion, devicePixelRatio, cores, saveData }` |
| `kinetic.motionPolicy` | 解析后的动效策略（见下） |
| `kinetic.setMotion(pref)` | 运行时切换 `'auto' \| 'reduce' \| 'full'` |
| `kinetic.setQuality(tier)` | `'high' \| 'mid' \| 'low' \| null`（`null` = 自适应） |
| `kinetic.liveListeners` | 本引擎当前持有的监听器数（调试用） |
| `kinetic.effectCount` | 存活效果数 |
| `kinetic.destroy()` | 释放全部效果与内核 |

`MotionPolicy` 字段：`reduced`、`durationScale`、`allowInertia`、`allowMagnetism`、`allowTrail`、`allowOverscrollRelease`、`snapImmediately`。

---

## kinetic.magnetic(el, options)

```js
const mag = kinetic.magnetic(button, {
  radius: 'auto',      // px 或 'auto'（由元素尺寸推导）
  strength: 0.34,      // 0..1，对指针偏移的放大比例
  maxOffset: 22,       // 位移上限（px）
  axis: 'both',        // 'x' | 'y' | 'both'
  scale: 1,            // 悬停缩放，与 transform 组合
  spring: { stiffness: 420, damping: 32 },
  releaseSpring: { stiffness: 170, damping: 20 }
})
```

| 方法 | 说明 |
|---|---|
| `mag.measure()` | 重测静止矩形。窗口 resize、字体加载、外部布局变化后调用 |
| `mag.setDisabled(bool)` | 临时停用（如模态框打开时） |
| `mag.phase` | `'idle' \| 'hover'` |
| `mag.destroy()` | 还原内联样式与属性 |

行为约束：`hover: none` 设备跳过；`event.buttons !== 0` 立即释放；减少动效下不位移，改设 `data-kinetic-magnetic="reduced"` 供 CSS 提供描边。

---

## kinetic.trail(canvas, options)

```js
const trail = kinetic.trail(canvas, {
  host: panel,        // 采样区域，默认 window
  length: 26,         // 保留采样数
  width: 7,
  color: '#e2a75f',
  mode: 'comet',      // 'comet' | 'dots'
  fade: 180           // 静止后淡出所需 ms
})
```

canvas 会自动按 DPR 设置 backing store；调用方只需给 CSS 尺寸。
`trail.enabled` 反映当前是否真的在画（触控设备或减少动效时为 `false`）。

---

## kinetic.elasticDrag(el, options)

```js
const drag = kinetic.elasticDrag(card, {
  axis: 'both',                          // 'x' | 'y' | 'both' | 'lock'
  bounds: { x: { min: -200, max: 200 } },
  overscroll: 0.15,                      // 橡皮筋常数，0 = 硬边界
  friction: 5,                           // 惯性衰减
  flingThreshold: 260,                   // px/s，超过才进入惯性
  snap: { x: [-200, 0, 200] },
  snapThreshold: 60,
  scaleWhileDrag: 1.02,
  threshold: 3,                          // 起拖阈值（px）
  onStart, onMove, onEnd, onCancel
})
```

| 方法 / 属性 | 说明 |
|---|---|
| `drag.position` | `{x, y}` 当前偏移 |
| `drag.phase` | `'idle' \| 'press' \| 'drag' \| 'inertia' \| 'settle'` |
| `drag.history` | 迁移历史 |
| `drag.rejectedTransitions` | 被拒绝的非法迁移次数 |
| `drag.setBounds(bounds)` | 舞台尺寸变化时更新边界（会立即把当前位置夹回界内） |
| `drag.moveTo(x, y, animate)` | 程序化移动 |
| `drag.abort(reason)` | 中止（不产生惯性） |
| `drag.destroy()` | 释放事件、样式、观察器 |

**语义细节：** 起拖阈值会从第一次位移中扣掉。`threshold: 3` 时，指针走 60px，元素走 57px。这是「不因为 1px 抖动就进入拖动」的代价，是上游语义，未改动。

**边界与越界：** 越界位移用与上游完全一致的橡皮筋函数压缩（有单测逐值比对），因此给 `@use-gesture` 老页面接上本引擎时手感不变。

---

## kinetic.inertialScroll(container, content, options)

```js
const scroll = kinetic.inertialScroll(scroller, content, {
  mode: 'native',                     // 'native'（默认）| 'virtual'
  friction: 6,
  wheelMultiplier: 1,
  snap: '[data-snap]',                // CSS 选择器或绝对偏移数组
  snapMode: 'mandatory',              // 'mandatory' | 'proximity'
  snapThreshold: 48,                  // proximity 模式生效
  onScroll({ position, max, phase })
})
```

| 方法 / 属性 | 说明 |
|---|---|
| `scroll.position` / `scroll.maxScroll` | 只读 |
| `scroll.currentMode` | `'native' \| 'virtual'` |
| `scroll.setMode(mode)` | 切换；减少动效时 `virtual` 会被降级为 `native` |
| `scroll.scrollTo(y, immediate)` | 程序化滚动（不会被吸附拉回） |
| `scroll.destroy()` | 还原 overflow / touch-action / transform |

**两种模式的差别不是「好不好看」，是「谁来维护无障碍」：**

- `native`：不劫持滚轮。原生惯性、键盘分页、`scrollIntoView`、锚点、页内查找全部照常；本引擎只在滚动停稳后补一次吸附（防抖 140ms，不用 `scrollend`——Safari 仍缺）。
- `virtual`：接管滚轮与触摸，`overflow: hidden`，用 transform 位移。代价是必须自己重建键盘分页、焦点入视口、锚点解析；本引擎已实现前三项，锚点需调用方用 `scrollTo` 处理。

---

## kinetic.gestures(el, options)

```js
const g = kinetic.gestures(pad, {
  tap: ({x, y}) => {},
  doubleTap: ({x, y}) => {},
  longPress: ({x, y}) => {},
  swipe: ({direction, velocity, distance}) => {},
  pinch: ({scale, centerX, centerY}) => {},
  tapMaxDistance: 12,
  tapMaxDuration: 260,
  doubleTapWindow: 320,
  longPressDuration: 500,
  swipeMinDistance: 44,
  swipeMinVelocity: 320,
  moveCancelThreshold: 8,
  capturePinch: false
})
```

| 属性 | 说明 |
|---|---|
| `g.phase` | 当前阶段 |
| `g.setDisabled(bool)` | 停用并取消挂起的定时器 |
| `g.destroy()` | 清定时器与监听器 |

三个必须知道的行为：

1. **`pointercancel` 不是 `pointerup`。** 滚动时手指划过按钮会发 `pointercancel`；当释放处理就会误触。
2. **doubleTap 会推迟单击。** 传了 `doubleTap` 时，单击要等 `doubleTapWindow` 到期才发——否则一次双击会触发三次回调。
3. **`capturePinch` 会牺牲原生缩放。** 开启后该元素 `touch-action: none`，页面双指缩放失效。默认关闭，需要两指手势的组件才开。

---

## 底层导出

做自定义效果时可直接用这些，不必从零写物理：

```js
import {
  FrameLoop, frameLoop,          // 单时钟
  Spring, Decay, SPRING_PRESETS, // 物理
  momentumDistance, clampMomentum, rubberbandPosition,
  InteractionMachine,            // 状态机
  Arbiter, PRIORITY,             // 指针仲裁
  Disposer, counters, liveListenerCount, resetCounters,
  readCapabilities, MotionController
} from 'kinetic-engine'
```

`FrameLoop.step(timestamp)` 是公开的确定性步进接口——测试用它驱动物理，不依赖真实时间。

```js
const stop = frameLoop.add(({ dtSec, tier, fps }) => {
  // 自己写效果：只读 dtSec，不要用 Date.now() 差分
}, /* priority */ 10)
```

`priority` 越小越先执行。只测量的效果放前面，写 DOM 的放后面，避免同一帧里读-写-读交错触发同步布局。
