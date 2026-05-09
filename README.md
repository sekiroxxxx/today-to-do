# 刷日常

每天上线，领取你的今日委托。算法帮你从求职和任务中，自动排出今天最值得做的 3～5 件事。

---

## 技术栈

- **前端**：微信小程序原生 + WXML/WXSS/JS
- **后端**：微信云开发 CloudBase（16 个 Serverless 云函数）
- **算法**：多维度加权排序（吸引力 × 准备度 × 紧迫度 + 归一化 + 多样性保护）
- **数据库**：微信云开发文档型数据库

## 功能

- **日常**：算法每日生成 3～5 条优先级排序的行动卡片，S/A/B/C 四级评定
- **求职**：岗位全生命周期管理，投递漏斗看板，状态时间轴，拒绝原因追踪
- **任务**：自定义任务，优先级分级，重复规则（每天/每周），禁用/启用
- **我的**：周/月完成统计，求职漏斗概览，动态鼓励文案
- **离线缓存**：断网时不白屏，显示上次缓存数据

## 项目结构

```
cloudfunctions/              # 16 个云函数
├── login/                   # 用户登录
├── addJob/ updateJob/ getJobList/ updateJobStatus/ deleteJob/
├── addTask/ updateTask/ getTaskList/ deleteTask/
├── generateDailyActions/    # 核心算法 + 清单生成
│   └── utils/algorithm.js   # 纯函数算法模块
├── getTodayActions/         # 查询今日清单
├── completeAction/          # 完成行动
├── postponeAction/          # 推迟（稍后提醒/跳过今天）
├── getStats/                # 统计数据
└── scheduledPush/           # 定时推送

miniprogram/
├── components/              # 6 个通用组件
│   ├── action-card/         # 行动卡片（S/A/B/C 评级）
│   ├── star-rating/ empty-state/ skeleton/
│   └── status-tag/ action-sheet/
├── pages/
│   ├── welcome/             # 欢迎页
│   ├── today/               # 日常
│   ├── jobs/ + add/ + detail/  # 求职
│   ├── tasks/ + add/        # 任务
│   └── mine/                # 我的
└── utils/
    ├── api.js               # 云函数封装层
    └── phrases.js           # 文案配置

```

## 算法

智能优先级推荐算法（`cloudfunctions/generateDailyActions/utils/algorithm.js`）：

- **求职任务** = (吸引力 × 0.2 + 准备度 × 0.3 + 紧迫度 × 0.5) × 状态衰减
- **自定义任务** = 基础优先级分 + 周期紧迫度 - 推迟惩罚
- 两类任务 Min-Max 归一化后混合排序
- 连续 3 天未上榜的类型强制插入保护

## 本地运行

1. 微信开发者工具导入项目
2. 开通云开发环境，创建 4 个集合：`users`、`job_applications`、`custom_tasks`、`daily_actions`
3. 集合权限设为"仅创建者可读写"
4. 逐个部署 cloudfunctions 目录下的云函数
5. 编译预览

---

v1.0 · 刷日常
