# v1.1 Bug 修复计划

按顺序修。修完一个方案验收通过后再修下一个。

---

## 方案三：完成操作无用户反馈

**关联 Bug**：
- 日常-点完成，1-2s 后卡片消失，无 toast
- 日常-自定义任务完成后无提示
- 创建-提交后按钮变灰"保存中"，页面不跳转不提示

**根因**：`module-task` 组件完成回调没 toast。创建页 toast 太短 + navigateBack 间隙吞了提示。

**修复**：
1. `components/module-task/module-task.js` — `api.completeAction` 成功后调 `wx.showToast`，文案从 `phrases.js` 随机完成池取
2. `pages/create/create.js` — 提交成功后 toast 1000ms，navigateBack 延迟 1000ms，确保用户看到提示

**验收**：
1. 日常页点"完成" → 立即弹出 toast "委托达成！"，卡片 0.5s 后消失
2. 创建页点提交 → toast "已创建" → 1s 后自动返回

---

## 方案四：跳转和交互补全

**关联 Bug**：
- 推进-添加按钮点不动
- 创建-求职卡片点了没反应
- 创建-不知道可以滑动查看更多模块

**根因**：推进页的 `+` 按钮 `bindtap` 未绑定。创建页模块卡片没有点击事件。模块选择区横向溢出无提示。

**修复**：
1. `pages/progress/progress.wxml` — `+` 按钮绑定 `bindtap="onAdd"`
2. `pages/progress/progress.js` — `onAdd` 实现：`navigateTo('/pages/create/create?module=' + currentModule)`
3. `pages/create/create.js` — `onLoad` 读 `options.module`，有则默认选中对应模块
4. `pages/create/create.wxml` — 每个模块选择卡片加 `bindtap="onModuleSelect"`
5. 模块选择器用网格布局确保所有选项一屏可见，或加左右箭头提示

**验收**：
1. 推进页求职工作台点"添加" → 跳到创建页 → 默认选中"求职"
2. 创建页点击"工作"卡片 → 表单切换为工作表单
3. 创建页所有模块选项一屏内可见

---

## 方案五：主题色硬编码残留

**关联 Bug**：我的-用户名卡片仍是蓝色

**根因**：`mine.wxss` 的 `.user-card` 硬编码了 `#1677FF` 渐变，没跟 CSS 变量走

**修复**：
1. `pages/mine/mine.wxss` — `.user-card` 的 `background` 改为 `linear-gradient(135deg, #D97706, #E5A840)`
2. 全局搜索 `#1677FF` 和 `#69B1FF`（WXSS 文件中），逐个确认是否还有硬编码残留

**验收**：
1. "我的"页面顶部卡片为暖金色渐变
2. 全局搜 WXSS 文件不再有 `#1677FF` 硬编码

---

## 方案六：数据加载无过渡

**关联 Bug**：
- 推进-切模块后漏斗延迟出现
- 推进-从创建页回来新任务突兀出现
- 日常-只有求职日常没有自定义

**根因**：推进页切模块时数据返回前无过渡。日常页自定义模块数据可能没被正确查询。

**修复**：
1. `pages/progress/progress.js` — 切模块时加 `isLoading` 状态，保持旧数据不消失，新数据返回后平滑替换
2. `pages/progress/progress.js` — `onShow` 检查脏标记后静默刷新（v1.0 同样逻辑）
3. 日常 #1 诊断 — 检查 `cloudfunctions/generateDailyActions/index.js` 是否按 `module` 字段正确查询 `custom_tasks`

**验收**：
1. 推进页切模块 → 内容保持 → 骨架屏 → 新数据替换，无闪烁空白
2. 创建页新建后返回 → 推进页自动出现新任务
3. 日常页同时显示求职和自定义两个模块
