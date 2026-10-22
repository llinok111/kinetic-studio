# 选向与缺口取证

## 1. 候选评估（数据来自 GitHub API，2026-10-22）

| 项目 | ★ | 许可 | 最后推送 | 体积 | 判定 |
|---|---|---|---|---|---|
| **pmndrs/use-gesture** | 9 623 | MIT | 2024-07-15 | 187 MB（含文档站资源） | **选** |
| darkroomengineering/lenis | 16 790 | MIT | 2026-10-18 | 10 MB | 淘汰：只覆盖「惯性滚动」一项，磁吸/轨迹/弹性拖动/手势/状态机全无 |
| hammerjs/hammer.js | 24 324 | MIT | 2026-01-04 | 10 MB | 淘汰：2011 年架构，317 open issues，独立 recognizer 体系与 Pointer Events 并存会重复归一化 |

**为什么不是星最多的那个。** 星数衡量的是「被多少人用过」，不是「离目标还差多少」。lenis 已经很擅长滚动，选它意味着剩下五件事全从零写，而且要在它的滚动模型里嵌进去；hammer 太老，接入它等于同时维护两套触摸归一化。

`use-gesture` 正好卡在分界线上：**它把手势识别做完了，把运动留空了**。这不是「作者偷懒」，是职责边界——库无法知道你希望松手后滑多远。

## 2. 缺口取证：在 `packages/core/src` 里 grep

判定标准：命中 0 个文件才算真缺口（有命中要逐条看是不是注释/文档）。

| 能力关键词 | 命中文件数 |
|---|---|
| `magnet` | 0 |
| `inertia` | 0 |
| `momentum` | 0 |
| `decay` | 0 |
| `friction` | 0 |
| `fling` | 0 |
| `trajectory` | 0 |
| `snapTo` | 0 |
| `reduced-motion` | 0 |
| `prefers-reduced` | 0 |
| `matchMedia` | 0 |
| `requestAnimationFrame` | 0 |
| `visibilitychange` | 0 |
| `isConnected` | 0 |
| `longpress` / `doubletap` | 0 / 0 |

`requestAnimationFrame` 零命中是最有说服力的一条：**上游根本没有帧循环**。它是纯事件驱动的——`pointermove` 来一次算一次。速度算出来、事件流一停，生命就结束了。任何「松手之后继续运动」的能力在结构上都不可能存在。

## 3. 比「零命中」更硬的证据：上游知道问题、只给警告

`packages/core/src/engines/DragEngine.ts:274` 在 `setupPointer()` 里：

```js
if (device === 'pointer' && config.preventScrollDelay === undefined) {
  const style = window.getComputedStyle(currentTarget)
  if (style.touchAction === 'auto') {
    console.warn(
      `[@use-gesture]: The drag target has its \`touch-action\` style property set to \`auto\`.
       It is recommended to add \`touch-action: 'none'\` so that the drag gesture behaves
       correctly on touch-enabled devices. …`
    )
  }
}
```

它检测到了，但它**不修**——因为一个手势库无法知道目标元素是否位于一个纵向滚动的页面里，一律写 `none` 会把整页锁死。这是一个合理的克制，同时是一个清晰的责任空缺。

本项目知道轴向（`axis: 'x' | 'y' | 'both' | 'lock'`），所以能写对：

| 拖动轴 | 写入 | 后果 |
|---|---|---|
| `x` | `pan-y` | 横向拖动归引擎，纵向仍可滚页 |
| `y` | `pan-x` | 纵向拖动归引擎，横向仍可滚页 |
| `both` / `lock` | `none` | 全归引擎 |

并且销毁时按**原内联值与 `!important` 优先级**逐字还原（有单测锁住）。

## 4. 差异化：六个能力 + 五个工程约束

| 能力 | 上游 | 本项目 |
|---|---|---|
| 磁吸 | 无 | 静止矩形作触发区（避免抖动）、法向衰减、释放回弹、按下即释放 |
| 指针轨迹 | 无 | `getCoalescedEvents` 亚帧采样、DPR 缩放、切后台丢缓冲、低档降采样 |
| 弹性拖动 | 只有 `rubberband` 数学函数 | 1:1 跟手 + 越界压缩 + 释放惯性 + 吸附 + 元素脱离中止 |
| 惯性滚动 | 无 | 双模式：`native` 只补吸附不劫持；`virtual` 接管并重建键盘/焦点 |
| 触控手势 | 只有 drag 内的 `tap` 布尔与 `swipe` 数组 | 独立 recognizer：tap / doubleTap / longPress / swipe / pinch，含取消语义 |
| 状态管理 | 每种手势各有 `active/last/first` | 显式迁移表 + 非法迁移拒绝计数 |

| 工程约束 | 上游 | 本项目 |
|---|---|---|
| 减少动效 | 无感知 | `MotionPolicy` 区分「直接操作」与「自动运动」 |
| 低帧率 | 无 | 单时钟 + dt 钳制 + 子步积分 + 档位滞回 |
| 事件清理 | `EventStore` 只清监听器 | `Disposer` 覆盖监听器/定时器/rAF/观察器/内联样式，且计数可断言 |
| 触控正确性 | 仅告警 | 写 `touch-action`、把 `pointercancel` 当中止、抑制拖动后的合成 click |
| 元素脱离 | 无检查 | `MutationObserver` 检测 `isConnected`，立即 `abort("detached")` |

## 5. 兼容性承诺：上游一行未改

`packages/core/**` 与 `packages/vanilla/**` 的源码逐字节未修改。验证方式：

```bash
git diff --stat c779631aa -- packages/        # 上游最后一次提交之后无改动
```

新增代码只在 `engine/`、`studio/`、`scripts/`、`docs/`、`NOTICE`。

好处不只是「好合并上游更新」，更是**兼容性不需要论证**：所有既有 `@use-gesture` 页面行为不变，因为运行的是同一份代码。引擎层只在 `engine/src/upstream.ts` 这一个文件里 import 上游——`grep -rn "packages/core" engine/src` 只会返回它。

## 6. 风险（如实记录）

- 上游最后提交 2024-07（约 2 年）。代码 3 288 行、零运行时依赖、架构稳定，**停更不致命**：引擎把上游当只读基座，不依赖它的更新节奏。
- 上游 `packages/react` 是 React 绑定。本项目不碰它，只用 `core` 的 `Controller` 与六种引擎。React 用户可继续用自己的 `useDrag`，与引擎共存（仲裁器按 `pointerId` 归属，不区分来源）。
- 移动端真实设备未做人工验收，仅在 Chromium 的触控模拟（`hasTouch` + `PointerEvent` 合成）下验证。这条写在 `COMPATIBILITY.md` 的限制里，不当作已验证。
