# v1.1 Bug 修复计划

按顺序修。修完一个方案验收通过后再修下一个。

---

## 方案八：CSS 显隐替代 wx:if 渲染

**目标**：开关模块、切换筛选、loading→内容过渡等场景 0ms 响应，不销毁重建 DOM。

**依赖**：方案七（module 字段落地）先完成。

**修复**：

| 位置 | 当前 | 改为 |
|------|------|------|
| 日常页-模块区块 | 关模块 → dirty → 拉云函数 → 重新渲染 → 消失 | 关模块 → CSS `display:none` 立即隐藏，数据不删不重拉 |
| 模块内列表 vs 空状态 | `wx:if` 互斥 | 两者同时渲染，切换 opacity |
| 骨架屏到内容 | `wx:if` 切换 | 骨架屏 opacity:0 但保留占位，避免布局跳动 |
| 任务 Tab 进行中/已禁用 | `wx:if` 互斥 | 两组内容都渲染，切换 filter 只改 CSS 显隐 |
| 删除/编辑按钮 loading | `wx:if` 切换文案 | opacity 0.6 + pointer-events:none，不重建 DOM |

**需要改的文件**：
- `pages/today/today.wxml` — 模块区块从 wx:if 切为 CSS hidden
- `pages/tasks/tasks.wxml` — 进行中/已禁用从 wx:if 切为 CSS hidden
- `app.wxss` — 全局加 `.hidden` 和 `.fade` 工具类
- 所有页面的骨架屏/loading 遮罩 — wx:if → CSS 控制

**验收**：
1. 我的页关闭求职模块 → 切到日常页 → 求职区块 0ms 消失，无闪烁
2. 任务页切换"进行中/已禁用" → 0ms 切换，无列表重建
3. 骨架屏消失 → 内容出现 → 无布局跳动

---

## 方案九：操作即时反馈优化

**目标**：创建、删除、编辑等操作的等待感缩短到 1s 内。不做乐观更新——改反馈时序即可。

**依赖**：方案八先做完。

**修复**：

| 操作 | 当前 | 改为 |
|------|------|------|
| 创建任务/岗位 | toast → 等 800ms → navigateBack | toast 500ms → navigateBack，总耗时 < 1s |
| 删除 | API → 等 → toast → loadData 全量 | 按钮变"删除中..."→ API → toast → 本地 splice，不调 loadData |
| 编辑 | 同上 | 按钮变"保存中..."→ API → toast → 返回 |
| 推进状态 | 弹窗确认 → API → toast → loadJob 全量 | 弹窗确认 → 按钮"推进中..."→ API → toast → 本地更新 job.status |
| 完成操作 | 已完成（今天页有 toast + 本地移除） | 不变 |

**需要改的文件**：`jobs/add/add.js`、`jobs/detail/detail.js`、`tasks/add/add.js`、`tasks/tasks.js`

**不需要**：`utils/sync.js`（不做同步队列，单用户不需要）、不改云函数

**验收**：
1. 创建任务 → toast → < 1s 内跳回列表，任务已出现
2. 删除任务 → 按钮变"删除中..."→ toast → 列表移除，不重新拉数据
3. 编辑 → 按钮变"保存中..."→ toast → 返回

---

## 待确认方案

以下方案待确定后再展开：

### 当日完成记录
推进 Tab 每个模块工作区加"今日已完成"折叠区，纯前端聚合。

### 历史任务可见 + 清理
`pages/tasks/tasks` 加"已完成"筛选 Tab + "再做一次"按钮 + 手动删除。

### 历史岗位清理
求职管理页加"清理已关闭岗位"按钮。

---

