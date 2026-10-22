# 架构

## 1. 问题定义

`@use-gesture` 解决的是「这段指针轨迹算不算一次拖拽」。它把结果——偏移、速度、方向、是否越界——交给调用方，然后**结束**。

真实页面要求的是下一段：松开之后发生什么、和别的交互冲突时谁赢、触屏上为什么拖到一半就断、开了「减少动态效果」之后哪一个动画该留哪一个该删。这些不是手势识别问题，是**运动与所有权问题**。本项目补的就是这一层。

分界线用一句话说清：

| 层 | 负责 | 不负责 |
|---|---|---|
| 上游 `packages/core`（未改动） | 指针/触摸归一化、阈值与意图判定、橡皮筋函数、六种手势引擎 | 任何随时间演化的运动、设备能力、仲裁、清理 |
| 本项目 `engine/src/core` | 单帧时钟、能力探测、动效策略、物理积分、资源所有权 | 具体某个效果长什么样 |
| 本项目 `engine/src/effects` | 磁吸、轨迹、弹性拖动、惯性滚动、离散手势 | 彼此的优先级（交给仲裁器） |

## 2. 为什么是「一个时钟」

如果每个效果各跑一条 `requestAnimationFrame`：

- 12 条 rAF 回调本身不贵，但每条都可能触发一次样式读取，浏览器无法合并，布局/绘制被迫交错；
- 自适应降级失去依据——单条回调只知道自己慢，不知道整页 24fps；
- 各条回调的 `dt` 互不相同。一次拖动结束进入惯性时，卡片用 16.4ms 积分、轨迹用 17.1ms 采样，两帧后就肉眼可见地错开。

`FrameLoop` 把这三件事一次解决：订阅者按 `priority` 排序（测量者先于写入者），同一个 `dt` 广播给所有人，帧率用 EMA 汇总后驱动档位。

`dt` 必须钳制在 64ms。切后台再回来、或者一次长 GC 之后，首个 `dt` 可能是 30 000ms。Euler 积分器吃到这个值会直接把元素甩出屏幕；钳制之后，掉帧表现为「一帧走得慢」，而不是「炸开」。

## 3. 动效策略：直接操作 vs 自动运动

`prefers-reduced-motion` 经常被实现成一个布尔值，然后所有动画都关掉——包括跟随手指的位移。那等于把控件弄坏。

本项目的策略分成两组：

| 行为 | 归组 | 减少动效时 |
|---|---|---|
| 拖动时 1:1 跟手 | 直接操作 | **保留**（去掉就不是控件了） |
| 越界阻尼（手指仍在移动） | 直接操作 | **保留**（阻力是反馈，不是动画） |
| 松手后的惯性滑行 | 自动运动 | 移除，改为落点瞬时生效 |
| 松手后的回弹 / 吸附 | 自动运动 | 移除，落点瞬时生效 |
| 磁吸位移 | 自动运动（由指针触发但非用户主动位移） | 移除，改由 CSS 提供描边反馈 |
| 指针轨迹 | 装饰 | 整块关闭 |

依据是 WCAG 2.3.3「Animation from Interactions」：约束的是**交互触发的动画**，而不是直接操作本身。策略被固化为 `MotionPolicy`，效果层只读 `policy.allowInertia` 之类的字段，不再各自判断媒体查询——两个效果对「现在算不算减动效」有分歧，是只在用户机器上才会出现的 bug。

## 4. 仲裁：一个指针只能有一个主人

仲裁按 `pointerId` 记录归属，带优先级（`hover < scroll < drag < gesture < modal`）。更强的交互抢走指针时，弱者会收到 `onRevoke` 回调并自行 `abort()`，而不是被静默地停掉事件——后者会让状态机永远停在 `drag`。

四个真实症状由它消除：

1. 卡片拖到一半，浏览器开始原生滚动，卡片仍跟着手指；
2. 嵌套的两个可拖拽元素同时移动；
3. 双指缩放的同时，其中一根手指还在拖卡片；
4. 磁吸 hover 在用户拖动别的东西经过时，把按钮重新吸过去。

## 5. 状态机：非法迁移要被拒绝并计数

页面里同时存在磁吸、拖动、惯性、手势时，布尔标志会有十几面，其中合法组合很少。故障表现为**不可能的状态**：一边 dragging 一边 inertia、hover 效果在滚动中触发、一次 tap 同时把卡片挪了位置。

`InteractionMachine` 用显式迁移表；非法请求返回 `false` 并累加 `rejectedTransitions`。**不做强制纠正**——纠正会掩盖 bug，计数能让它在演示面板和测试里现形。

```
idle    → hover | press | drag | inertia | settle | blocked
hover   → press | idle | blocked
press   → drag | idle | hover | cancelled
drag    → inertia | settle | cancelled | idle
inertia → settle | drag | idle | cancelled
settle  → idle | hover | drag | cancelled
```

`drag → drag` 视为「刷新」而非非法：拖动中再次触发是正常的。

## 6. 资源所有权：清理要能证明

`removeEventListener` 只有三件事完全一致才有效：同一个函数引用、同一个 capture 标志、同一个 target。任何一处记错都会静默泄漏，只能靠性能面板发现。

`Disposer` 在绑定时就把 remover 闭包存下来，因此不存在参数不一致的可能；同时提供计数器，让测试可以断言「销毁后回到基线」而不是「我看代码觉得没问题」。

**样式也要按原值还原**。`el.style.touchAction = ''` 会把作者内联的值一并抹掉，组件卸载后页面就永久失去了滚动。`Disposer.style()` 记录原值与 `!important` 优先级，释放时逐字还原。

## 7. 触控正确性

上游 `DragEngine.setupPointer()` 检测到 `touch-action: auto` 时只做一件事：

```js
console.warn("The drag target has its `touch-action` style property set to `auto`. …")
```

它不修，因为库不知道目标元素是否位于一个纵向滚动的页面里，写错会锁死整页滚动。本项目知道轴向，所以按轴向写入并在销毁时还原：

| 拖动轴 | `touch-action` | 含义 |
|---|---|---|
| `x` | `pan-y` | 横向拖动归我，纵向仍可滚页 |
| `y` | `pan-x` | 纵向拖动归我，横向仍可滚页 |
| `both` | `none` | 全归我 |
| `lock` | `none` | 方向未定，必须先全部拿下 |

另外三件事上游没有：

- **`pointercancel` 必须当作中止**，不能当 `pointerup`。把取消当释放，「滚动时手指划过按钮」会触发点击。
- **拖动结束后要抑制合成 click**。上游的 `pointerClick` 只覆盖同一元素上的 click；跨元素结束的拖动仍会在共同祖先上产生一次点击。
- **元素从文档移除时必须中止**。组件卸载时永远等不到 `pointerup`，上游没有 `isConnected` 检查（源码零命中），拖动会一直活到页面刷新。

## 8. 低帧率

三处针对性处理：

1. **子步积分**。Spring 用半隐式 Euler，稳定条件约 `dt·√(k/m) < 0.5`。5fps 时 `dt = 0.2s`、`k = 170` 得 `dt·ω ≈ 2.6`，三帧内发散。钳制 `dt` 会改变动画速度，正确做法是把积分器切成固定 1/240s 的子步——任意帧率下物理行为一致。
2. **档位滞回**。降档快（18 帧）、升档慢（90 帧）。没有滞回时，处在阈值边界的页面会每帧翻转档位，每次翻转都重新分配轨迹缓冲区。
3. **按档位削减工作量**。低档下轨迹采样上限降到 40%、绘制隔帧；惯性积分不受影响（它只做算术，不做布局）。

## 9. 目录

```
engine/src/
├── upstream.ts              唯一 import 上游的文件（可审计）
├── core/
│   ├── capability.ts        能力探测（含 Safari<14 的 addListener 回退）
│   ├── context.ts           共享内核
│   ├── disposer.ts          资源所有权 + 计数器
│   ├── frame-loop.ts        单时钟 + 自适应档位
│   ├── math.ts              数值工具（含 deltaMode 归一化）
│   ├── motion.ts            动效策略
│   ├── motion-writer.ts     用独立 translate/scale 写入，不覆盖作者 transform
│   ├── spring.ts            Spring / Decay / 动量投影 / 橡皮筋
│   └── touch.ts             touch-action 与 click 抑制
├── interaction/
│   ├─��� arbiter.ts           指针归属与抢占
│   └── machine.ts           状态机 + 迁移表 + 拒绝计数
└── effects/
    ├── host.ts              上游 Controller 的生命周期宿主
    ├── magnetic.ts          磁吸
    ├── trail.ts             指针轨迹
    ├── elastic-drag.ts      弹性拖动
    ├── inertial-scroll.ts   惯性滚动（native / virtual）
    └── gestures.ts          tap / doubleTap / longPress / swipe / pinch
```

## 10. 已知限制

- **磁吸的静止矩形靠 `getBoundingClientRect` 缓存**，页面滚动、resize、字号变化会重测；若元素被外部 CSS 动画持续移动，缓存会漂移，此时需要手动调用 `measure()`。
- **`viewTransition` 与虚拟滚动不兼容**，两者都接管 transform，本引擎不尝试协调。
- **virtual 模式的滚动条是自绘缺失的**：容器 `overflow: hidden` 之后浏览器不再绘制滚动条，需要作者自行提供。
- **压力/倾斜（`pressure`、`tiltX`）未参与任何效果**，仅在 `state` 中透传。
- **`pinch` 需要 `capturePinch: true`**，它会把该元素的 `touch-action` 设为 `none`，等于放弃该区域的原生缩放。这是有代价的选择，默认关闭。
