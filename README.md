# kinetic-studio

**把手势库的「识别」补成「运动」：磁吸、轨迹、弹性拖动、惯性滚动、触控手势与交互状态机，跑在同一套时钟、同一份能力探测、同一条仲裁链上。**

基于 [`pmndrs/use-gesture`](https://github.com/pmndrs/use-gesture) core（MIT）二次开发，上游源码逐字节未改。在线演示：**https://llinok111.github.io/kinetic-studio/**

---

## 为什么需要这一层

`@use-gesture` 回答的是「这段指针轨迹算不算一次拖拽」。它把偏移、速度、方向交给你，然后**结束**——`requestAnimationFrame` 在整个 core 里命中 0 次，它是纯事件驱动的。

而真实页面要求的是下一段：松手之后滑多远、和别的交互冲突谁赢、触屏上为什么拖到一半就断、开了「减少动态效果」之后哪个动画该删。这些不是识别问题，是**运动与所有权问题**。

| 关键词 | 在 `packages/core/src` 的命中文件数 |
|---|---|
| `inertia` / `momentum` / `decay` / `friction` / `fling` | **0** |
| `magnet` / `snapTo` / `trajectory` | **0** |
| `reduced-motion` / `prefers-reduced` / `matchMedia` | **0** |
| `visibilitychange` / `isConnected` / `longpress` / `doubletap` | **0** |

更硬的一条：上游**知道** `touch-action` 的问题，只打印警告，不修（`DragEngine.ts:274`）——因为库不知道目标是否在滚动容器里，一律写 `none` 会锁死整页。引擎知道轴向，所以能写对，并在销毁时逐字还原。

---

## 六个能力

| 能力 | 关键设计 |
|---|---|
| **磁吸按钮** | 触发区固定在元素的**静止矩形**上。用元素自身位置做命中判定，会在按钮被吸向指针后产生「离开→回弹→再进入」的帧级抖动 |
| **指针轨迹** | `getCoalescedEvents()` 亚帧采样 + 按 DPR 缩放画布；切后台/失焦时丢缓冲，避免回前台画一条横跨屏幕的直线 |
| **弹性拖动** | 按下时 **1:1 跟手**（平滑=延迟），越界用与上游逐值一致的橡皮筋压缩，松手才交给物理 |
| **惯性滚动** | 双模式：`native`（默认）只补吸附、不劫持；`virtual` 接管并**重建**键盘分页、焦点入视口 |
| **触控手势** | tap / doubleTap / longPress / swipe / pinch；长按在位移 >8px 时取消，`pointercancel` 不算 tap |
| **状态管理** | 显式迁移表；非法迁移**拒绝并计数**，不静默纠正 |

## 五个工程约束

| 约束 | 处理方式 |
|---|---|
| **触控设备** | 按轴写 `touch-action`（`x→pan-y`、`y→pan-x`），销毁时还原原内联值与 `!important` |
| **减少动效** | `MotionPolicy` 区分「直接操作」（保留 1:1 跟手）与「自动运动」（惯性/回弹/磁吸/轨迹全部移除） |
| **事件清理** | `Disposer` 覆盖监听器/定时器/rAF/观察器/内联样式；`liveListenerCount()` 让「销毁后归零」可断言 |
| **低帧率** | 单时钟 + `dt` 钳制 64ms + 弹簧子步积分（1/240s）+ 档位滞回（降快升慢） |
| **异常边界** | 元素脱离 DOM → `abort("detached")`；`pointercancel` → 中止不产生惯性；NaN 位移不进 `transform` |

---

## 快速开始

```bash
npm install kinetic-engine
```

```js
import { createKinetic } from 'kinetic-engine'

const kinetic = createKinetic()          // 每页一个实例

kinetic.magnetic(button, { strength: 0.34 })          // 磁吸
kinetic.elasticDrag(card, {                           // 弹性拖动
  bounds: { x: { min: -200, max: 200 } },
  snap: { x: [-200, 0, 200] }
})
kinetic.inertialScroll(scroller, content, {           // 惯性滚动（默认不劫持）
  snap: '[data-snap]'
})
kinetic.gestures(pad, { tap, doubleTap, longPress, swipe })   // 离散手势
kinetic.trail(canvas, { color: '#e2a75f' })           // 指针轨迹

kinetic.destroy()                                     // 全量清理
```

零依赖、无 peer requirement：构建产物已包含上游 core，不会出现「引擎与 `@use-gesture` 版本不匹配」。

完整 API、单位约定（**速度一律 px/s**，上游的 px/ms 且无符号是已知坑）见 [`docs/API.md`](docs/API.md)。

---

## 演示

在线：**https://llinok111.github.io/kinetic-studio/**　本地：`node scripts/serve.mjs` → http://127.0.0.1:4321/

八个可直接操作的面板，每一个都能被关掉、被降级、被剥离：

1. **磁吸按钮** —— 四档半径与强度 + 嵌套（卡片内的按钮各自磁吸）
2. **指针轨迹** —— 拖尾线 / 点阵切换，长度与粗细实时可调
3. **弹性拖动** —— 越界阻力、甩出惯性、松手吸附；含「删除元素」「恢复元素」
4. **惯性滚动** —— native / virtual 现场对比，键盘与焦点行为保留
5. **触控手势** —— 点击、双击、长按、滑动、双指缩放，带事件日志
6. **交互状态机** —— 三个效果各自的 phase、拒绝迁移计数、迁移日志
7. **边界实验室** —— 挂载/卸载 ×50 泄漏检测、拖动中移除 DOM、`pointercancel`、三指同按、切后台
8. **全局开关** —— 动效偏好与画质档位，实时改变所有面板的行为

---

## 测试与验证

| 项目 | 结果 |
|---|---|
| 单元测试（vitest + jsdom） | **132 passed** |
| 端到端（Playwright + Edge 155） | **40 passed** |
| 视觉验收（自研 PNG 解码 + 3×3 块亮度动态范围） | **8 张截图，0 失败块** |
| 文字对比度（WCAG AA） | 8 个取样点全过，最低 4.77:1 |
| 体积 | ESM 123.3 KiB / IIFE 65.6 KiB (min) / CSS 1.0 KiB |

```bash
cd engine && npm ci
npm test                     # 132
npx playwright test          # 40
node scripts/verify.mjs      # 截图 + 像素统计 + DOM 探针 + 对比度
```

端到端覆盖的是真实浏览器行为，不是「函数被调用过」：拖动确实移动了元素、`virtual` 滚动确实产生了 transform、`fingerprint` 无关的焦点确实进了视口、50 次挂载卸载后**真实 DOM 监听器**回到基线（通过 patch `EventTarget` 统计，而不是读引擎自己的计数器）。

---

## 目录

```
engine/            引擎源码（TypeScript）+ 构建 + 单元/端到端测试 + 视觉验收
  src/core/        时钟、能力、动效策略、物理、资源所有权、触控正确性
  src/interaction/ 状态机、指针仲裁
  src/effects/     磁吸、轨迹、弹性拖动、惯性滚动、手势
studio/            静态演示（无打包器，vendor/ 内含已构建的 IIFE）
scripts/           零依赖静态服务器、演示产物同步
docs/              架构 / API / 兼容性 / 选向取证
shots/verify/      验收截图与 report.json
```

## 文档

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) —— 分层依据、单时钟、动效策略、仲裁、子步积分、已知限制
- [`docs/API.md`](docs/API.md) —— 全部选项与单位约定
- [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md) —— 验证过的环境、**未验证的也写清楚**、降级矩阵
- [`docs/DIFFERENTIATION.md`](docs/DIFFERENTIATION.md) —— 选向数据与缺口取证（含 grep 结果与上游告警行号）

---

## 上游与许可

- 上游：`pmndrs/use-gesture` v10.3.1，MIT，9 623 ★，保留全部 1 360 条提交历史
- 本项目新增代码：MIT，见 [`LICENSE`](LICENSE) 与 [`NOTICE`](NOTICE)
- `packages/**` 未改动：`git diff c779631aa -- packages/` 为空

## 已知限制

1. 起拖阈值会从第一次位移扣掉（`threshold: 3`，指针走 60px 元素走 57px）——上游语义，为兼容既有页面未改。
2. `virtual` 模式没有原生滚动条，需作者自绘。
3. `pinch` 需显式 `capturePinch: true`，会放弃该区域的原生双指缩放。
4. 力矩吸附只对用户驱动的滚动生效；程序化 `scrollTo` 与焦点入视口不吸附——否则聚焦到吸点之间的输入框会被立刻拉走。
5. **Firefox / WebKit / iOS / Android 真机未验证**，只在 Chromium（含触控模拟）上跑过用例。代码按标准实现并有回退，但不声称已支持。
