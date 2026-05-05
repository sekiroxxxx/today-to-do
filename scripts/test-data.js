/**
 * 测试数据脚本 — 在微信开发者工具控制台逐段粘贴执行
 *
 * 覆盖场景：
 *   - 高/中/低优先级任务
 *   - 重复任务（每天/每周）
 *   - 不同状态的求职岗位
 *   - 不同紧迫度的岗位
 *   - 有推迟次数的任务
 */

// ========== 使用方式 ==========
// 在微信开发者工具控制台，逐段粘贴并执行。
// 每段末尾加 .then(res => console.log(res.result)) 查看结果。

// ============================================================
// 第1组：自定义任务（测试优先级排序 + 重复规则）
// ============================================================

// 1a. 高优先级 — 每天重复（今天已完成过 → 紧迫度低）
wx.cloud.callFunction({
  name: 'addTask',
  data: {
    title: '刷 LeetCode 三道题',
    note: '重点：动态规划和二叉树',
    priority: 1,
    estimatedMinutes: 90,
    repeatRule: { type: 'daily' },
    deadline: ''
  }
})

// 1b. 高优先级 — 一次性任务（创建3天后 → 有一定紧迫度）
wx.cloud.callFunction({
  name: 'addTask',
  data: {
    title: '更新简历上的项目经历',
    note: '补充今日行动清单这个项目',
    priority: 1,
    estimatedMinutes: 30,
    repeatRule: { type: 'none' },
    deadline: '2026-05-08'
  }
})

// 1c. 中优先级 — 每周一三五（今天周一 → 今天应该出现）
wx.cloud.callFunction({
  name: 'addTask',
  data: {
    title: '跑步 5 公里',
    note: '天气好就户外，下雨就跑步机',
    priority: 2,
    estimatedMinutes: 40,
    repeatRule: { type: 'weekly', daysOfWeek: [1, 3, 5] }
  }
})

// 1d. 中优先级 — 无截止日，低紧迫度
wx.cloud.callFunction({
  name: 'addTask',
  data: {
    title: '整理书桌和开发环境',
    note: '',
    priority: 2,
    estimatedMinutes: 15,
    repeatRule: { type: 'none' }
  }
})

// 1e. 低优先级 — 可延迟的
wx.cloud.callFunction({
  name: 'addTask',
  data: {
    title: '看看新的前端框架评测文章',
    note: '了解一下 React 19 的新特性',
    priority: 3,
    estimatedMinutes: 20,
    repeatRule: { type: 'none' }
  }
})

// ============================================================
// 第2组：求职岗位（测试算法加权排序）
// ============================================================

// 2a. 高吸引力 + 高准备度 + 待投递 → 应该排名很高
wx.cloud.callFunction({
  name: 'addJob',
  data: {
    company: '字节跳动',
    position: '高级前端工程师',
    salaryRange: '30k-50k',
    applyLink: 'https://zhaopin.bytedance.com',
    deadline: '2026-05-20',
    attractionScore: 5,
    preparednessScore: 4
  }
})

// 2b. 高吸引力 + 低准备度 + 待投递 → 紧迫但需要准备
wx.cloud.callFunction({
  name: 'addJob',
  data: {
    company: '腾讯',
    position: '前端开发工程师',
    salaryRange: '25k-45k',
    attractionScore: 5,
    preparednessScore: 2
  }
})

// 2c. 中吸引力 + 已投递 → 需要跟进
wx.cloud.callFunction({
  name: 'addJob',
  data: {
    company: '阿里巴巴',
    position: '前端实习生',
    salaryRange: '20k-30k',
    attractionScore: 3,
    preparednessScore: 3
  }
})

// 2d. 低吸引力 + 已投递 → 可作为备选
wx.cloud.callFunction({
  name: 'addJob',
  data: {
    company: '某不知名创业公司',
    position: '全栈开发',
    salaryRange: '15k-20k',
    attractionScore: 2,
    preparednessScore: 1
  }
})

// 2e. 面试中 + 高吸引力 → 应优先展示
wx.cloud.callFunction({
  name: 'addJob',
  data: {
    company: '美团',
    position: '前端架构师',
    salaryRange: '35k-55k',
    attractionScore: 4,
    preparednessScore: 4
  }
})

// 2f. 快截止的岗位 → 紧迫度极高
wx.cloud.callFunction({
  name: 'addJob',
  data: {
    company: '华为',
    position: '鸿蒙开发工程师',
    salaryRange: '25k-40k',
    deadline: '2026-05-06',
    attractionScore: 4,
    preparednessScore: 3
  }
})

// ============================================================
// 第3组：模拟延迟完成的任务（测试推迟累积）
// 手动操作：选择一条任务 → 点击"跳过今天" → 重复操作2-3次
// 然后查看推迟次数变化和排序位置变化
// ============================================================

// ============================================================
// 第4组：验证算法排序（在控制台执行）
// ============================================================
/*
wx.cloud.callFunction({ name: 'generateDailyActions', data: { forceRegenerate: true } })
  .then(res => {
    console.table(res.result.actions.map(a => ({
      来源: a.sourceType === 'job' ? '求职' : '任务',
      标题: a.title,
      描述: a.description,
      归一化分: Math.round(a.normalizedScore),
      原始分: a.rawScore
    })))
    console.log('多样性修正:', res.result.diversityApplied)
  })
*/

// ============================================================
// 预期结果（仅供参考，实际会因日期和已有数据有差异）：
// ============================================================
//
// 今日清单 Top 5 大致排序应为：
//   1. 华为-鸿蒙开发（快截止+待投递 → 紧迫度最高）
//   2. 字节跳动-高级前端（吸引力5+准备度4 → 综合分高）
//   3. 刷 LeetCode（高优先级+每天重复 → 如果上次完成距今>1天则紧迫度高）
//   4. 美团-前端架构师（面试中+高吸引力 → 衰减后仍有竞争力）
//   5. 更新简历（高优先级+一次性+有截止日 → 中等紧迫度）
//
// 低优先级任务「看前端评测」理论上不会进入 Top 5（除非多样性强制插入）
