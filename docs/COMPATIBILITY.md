# 兼容性与降级

## 1. 验证过的环境（可复跑）

| 环境 | 版本 | 方式 | 覆盖 |
|---|---|---|---|
| Chromium（Edge 内核） | 155.0.4283.62 | `@playwright/test` 1.49.1，headless | 40 个端到端用例：鼠标、滚轮、键盘、焦点、触控模拟、减少动效、多指 |
| Node.js | 22.22.2 | vitest 2.1.9 + jsdom 25 | 133 个单元用例：物理、状态机、仲裁、清理、能力回退 |
| 视口 | 1280×900 / 360×780 | Playwright viewport | 布局不溢出、面板可见 |

复跑命令：

```bash
cd engine && npm ci
npm test                        # 单元 133
npx playwright test             # 端到端 40（需要本机 Edge 或设置 KINETIC_BROWSER）
node ../scripts/verify.mjs      # 截图 + 像素统计
```

## 2. 未验证，不声称支持

以下都不在「已验证」范围内，写在这里是为了不让读者误以为已经覆盖：

- **Firefox / WebKit（Safari）真实引擎**：本机只装了 Chromium。代码按标准实现（Pointer Events、`translate`/`scale` 独立属性检测、`matchMedia` 的 `addListener` 回退），但没有在这些引擎上跑过用例。
- **iOS Safari / Android Chrome 真机**：触控只在 Chromium 的 `hasTouch` 模拟下测过。真机的 `touch-action` 与 `pointercancel` 时序、以及 iOS 的滚动回弹会与模拟不同。
- **Windows 高对比度模式、屏幕阅读器**：只做了键盘可达性与焦点可见的自动断言。
- **`prefers-reduced-motion` 在测试夹具中不自动生效**：Chromium 155 下 `test.use({ reducedMotion })` 没有传到 `window.matchMedia`，端到端用例改用 `page.emulateMedia()` 显式设置，并额外断言媒体查询确实为 `true`（防止「假绿」）。

## 3. 特性检测与回退

| 特性 | 检测方式 | 缺失时的行为 |
|---|---|---|
| `PointerEvent` | `'PointerEvent' in window` | 上游自动退回 Touch/Mouse 事件；引擎的 `deviceHint()` 不再强制 `pointer` |
| `pointerdown` 属性 | `'onpointerdown' in window` | 同上传退（这是上游实际使用的判据，与 `PointerEvent` 不同） |
| 独立 `translate` / `scale` | `CSS.supports('translate','10px')` | 退回把 `translate3d()` 前置到已记录的内联 `transform`，销毁时还原 |
| `matchMedia().addEventListener` | 存在性检测 | 退回 Safari < 14 的 `addListener`/`removeListener`，**成对**使用，不混用 |
| `ResizeObserver` | 存在性检测 | 跳过自动重测，需手动调用 `measure()` |
| `MutationObserver` | 存在性检测 | 关闭「元素脱离中止」，其余不变 |
| `getCoalescedEvents` | 存在性检测 | 每帧只取一次 `pointermove` 采样，轨迹在快速划过时有折角 |
| `navigator.connection.saveData` | 可选链 | 视为 `false` |
| `navigator.hardwareConcurrency` | 类型检查 | `null` |

## 4. 降级矩阵

| 条件 | 磁吸 | 轨迹 | 弹性拖动 | 惯性滚动 | 手势 |
|---|---|---|---|---|---|
| 普通鼠标 / 触控板 | 全功能 | 全功能 | 全功能 | 全功能 | 全功能 |
| `hover: none`（纯触屏） | **关闭** | **关闭** | 全功能（`touch-action` 按轴写入） | 全功能 | 全功能 |
| `prefers-reduced-motion: reduce` | 关闭，改描边 | **关闭** | 跟手保留，惯性/回弹移除 | `virtual` 降为 `native` | 保留（无动画） |
| 低帧率档（`tier = 'low'`） | 不变 | 采样上限 ×0.4、隔帧绘制 | 不变（纯算术） | 不变 | 不变 |
| 页面切后台 | 释放 | 清空缓冲 | 中止 | 停止积分 | 中止 |
| 元素被移出 DOM | 释放 | — | `abort('detached')` | 重测边界 | 取消挂起定时器 |
| `pointercancel`（滚动/系统手势） | 释放 | — | 中止，不产生惯性 | 结束拖拽 | 视为取消，不算 tap |
| 内容不足一屏 | — | — | — | `maxScroll = 0`，接管自动无效 | — |

## 5. 已知的行为边界

1. **起拖阈值会被扣掉。** `threshold: 3` 时指针走 60px，元素走 57px。这是上游语义，为保证既有页面手感不变而没有改。
2. **`virtual` 模式没有原生滚动条。** `overflow: hidden` 后浏览器不再绘制滚动条，需要作者提供替代指示（演示里用了位置读数）。
3. **`pinch` 需要显式 `capturePinch: true`**，它会把该元素 `touch-action` 设为 `none`，等于放弃该区域的双指缩放。
4. **模式切换会保留位置**，但只在 `maxScroll` 之内；内容高度变化后需要重新 `measure`（`ResizeObserver` 已自动处理内容尺寸变化）。
5. **力矩吸附只对用户驱动的滚动生效。** 程序化 `scrollTo` 与焦点入视口不做吸附——否则聚焦到吸点之间的输入框会被立刻拉走，光标不可见。
6. **磁吸的触发区基于静止矩形**；若元素被外部 CSS 动画持续移动，缓存会漂移，需手动 `measure()`。
7. **多指上限默认取 `max(2, navigator.maxTouchPoints)`**；超过上限的指针不会被任何交互认领，但不影响页面其它部分。

## 6. 体积

| 产物 | 大小 |
|---|---|
| `dist/kinetic-engine.js`（ESM，含上游 core） | 123.3 KiB |
| `dist/kinetic-engine.cjs` | 124.5 KiB |
| `dist/kinetic-engine.global.js`（IIFE，minified） | 65.6 KiB |
| `dist/kinetic.css` | 1.0 KiB |

上游 core 被整体打进产物，因此**不需要**同时安装 `@use-gesture/*`，也消除了「引擎与上游版本不匹配」这一类问题。代价是产物体积包含未使用的 `wheel`/`scroll`/`move`/`hover` 引擎（约 8 KiB minified）。
