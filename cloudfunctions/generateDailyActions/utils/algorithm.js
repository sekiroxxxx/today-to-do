/**
 * 今日行动清单 — 智能优先级推荐算法
 *
 * 【设计原则】
 * 1. 所有函数都是纯函数：入参数组，出参数组，不碰数据库
 * 2. 算法和 UI / 数据库完全解耦，可以独立测试
 * 3. 前端也可以复刻这一套逻辑做客户端预排序（离线场景）
 *
 * 【算法流程概览】
 * 候选任务（求职 + 自定义）
 *   → 各自计算行动分（calcJobScore / calcTaskScore）
 *   → 各自内部归一化到 0~100（normalizeScores）
 *   → 混合排序（rankAndSelect）
 *   → 多样性保护（enforceDiversity）
 *   → 返回 Top 3~5
 */

// ============================================================
// 第一部分：求职岗位评分
// ============================================================

/**
 * 计算单个求职岗位的行动分
 *
 * 公式：
 *   rawScore = (吸引力归一化×W1 + 准备度归一化×W2 + 紧迫度归一化×W3)
 *            × 状态衰减系数 × 100
 *
 * @param {Object} job - 岗位记录
 *   - attractionScore: 1~5 吸引力评分
 *   - preparednessScore: 1~5 准备度评分
 *   - nextActionDate: Date | string  下次建议行动日
 *   - status: '待投递' | '已投递' | '面试中' | 'Offer' | '已拒绝'
 *   - postponeCount: 连续推迟次数
 * @param {Date|string} [today] - "今天"的日期，不传则用当前时间
 * @returns {number} 行动分（约 0~100）
 */
function calcJobScore(job, today) {
  const now = today ? new Date(today) : new Date()
  // 将所有时间归一化到当天 0 点，避免时分秒干扰天数计算
  now.setHours(0, 0, 0, 0)

  // ---- 1. 吸引力归一化（0.2 ~ 1.0） ----
  // 除以 5，让 1~5 映射到 0.2~1.0
  const attractionNorm = (job.attractionScore || 1) / 5

  // ---- 2. 准备度归一化（0.2 ~ 1.0） ----
  const preparednessNorm = (job.preparednessScore || 1) / 5

  // ---- 3. 紧迫度计算（0 ~ 100） ----
  // 核心思路：距离"下次建议行动日"越近，紧迫度越高
  // 公式：urgency = 100 / (1 + 距今天数)
  //   - 今天到期 → 100 分
  //   - 1 天后 → 50 分
  //   - 5 天后 → 16.7 分
  //   - 30 天后 → 3.2 分
  let urgencyScore = 0
  if (job.nextActionDate) {
    const nextDate = new Date(job.nextActionDate)
    nextDate.setHours(0, 0, 0, 0)
    // 距今天的天数，最小为 0（不出现负数）
    const daysUntilAction = Math.max(0, (nextDate - now) / (1000 * 60 * 60 * 24))
    urgencyScore = 100 / (1 + daysUntilAction)
  }

  // ---- 4. 状态衰减系数 ----
  // 越靠近流程起点，得分越高（鼓励推进卡住的流程）
  // Offer 和已拒绝的岗位不参与排序（返回 0）
  const statusDecay = {
    '待投递': 1.0,   // 满分不衰减
    '已投递': 0.9,   // 轻微衰减，仍需要跟进
    '面试中': 0.8,   // 再衰减一点，但保持紧迫
    'Offer': 0,      // 不参与排序
    '已拒绝': 0      // 不参与排序
  }
  const decay = statusDecay[job.status] !== undefined ? statusDecay[job.status] : 0

  // ---- 5. 加权求和 ----
  // W1 + W2 + W3 = 1.0，紧迫度权重最大（0.5）
  const W1 = 0.2  // 吸引力权重
  const W2 = 0.3  // 准备度权重
  const W3 = 0.5  // 紧迫度权重

  const weightedSum = (attractionNorm * W1) + (preparednessNorm * W2) + ((urgencyScore / 100) * W3)
  const rawScore = weightedSum * decay * 100

  // ---- 6. 推迟惩罚 ----
  // 每次"跳过今天"扣 20 分，可扣至负分
  const postponePenalty = (job.postponeCount || 0) * 20

  return Math.round((rawScore - postponePenalty) * 100) / 100  // 保留两位小数
}

// ============================================================
// 第二部分：自定义任务评分
// ============================================================

/**
 * 计算单个自定义任务的行动分
 *
 * 公式：
 *   rawScore = 基础优先级分 + 周期紧迫分 - 推迟惩罚
 *
 * @param {Object} task - 任务记录
 *   - priority: 1(高) | 2(中) | 3(低)
 *   - repeatRule: { type: 'none'|'daily'|'weekly', daysOfWeek: [1,3,5] }
 *   - lastCompletedAt: Date|null  上次完成时间
 *   - postponeCount: 连续推迟次数
 *   - createdAt: 创建时间
 *   - deadline: string  截止日 "YYYY-MM-DD"
 * @param {Date|string} [today]
 * @returns {number} 行动分
 */
function calcTaskScore(task, today) {
  const now = today ? new Date(today) : new Date()
  now.setHours(0, 0, 0, 0)

  // ---- 1. 基础优先级分 ----
  const baseScoreMap = { 1: 80, 2: 50, 3: 20 }
  const baseScore = baseScoreMap[task.priority] || 50

  // ---- 2. 周期紧迫分 ----
  let cycleUrgency = 0

  if (task.repeatRule && task.repeatRule.type !== 'none') {
    // ---- 情况A：重复任务 ----
    // 距上次完成的天数 / 目标间隔天数 × 30，上限 30
    if (task.lastCompletedAt) {
      const lastDate = new Date(task.lastCompletedAt)
      lastDate.setHours(0, 0, 0, 0)
      const daysSinceLast = Math.max(0, (now - lastDate) / (1000 * 60 * 60 * 24))

      // 计算目标间隔天数
      let intervalDays = 1  // 默认每天
      if (task.repeatRule.type === 'weekly') {
        // 假设均匀分布，平均间隔 = 7 / 选中的天数
        const dayCount = (task.repeatRule.daysOfWeek || []).length || 1
        intervalDays = Math.round(7 / dayCount)
      }
      // daily → intervalDays = 1

      // 周期紧迫分 = 已过天数 / 目标间隔 × 30，上限 30
      cycleUrgency = Math.min((daysSinceLast / intervalDays) * 30, 30)
    }
    // 如果没有 lastCompletedAt（任务创建后还没完成过），
    // 使用 createdAt 来计算
    else if (task.createdAt) {
      const createDate = new Date(task.createdAt)
      createDate.setHours(0, 0, 0, 0)
      const daysSinceCreated = Math.max(0, (now - createDate) / (1000 * 60 * 60 * 24))

      let intervalDays = 1
      if (task.repeatRule.type === 'weekly') {
        const dayCount = (task.repeatRule.daysOfWeek || []).length || 1
        intervalDays = Math.round(7 / dayCount)
      }
      cycleUrgency = Math.min((daysSinceCreated / intervalDays) * 30, 30)
    }

  } else {
    // ---- 情况B：非重复任务 ----
    // 创建后每天 +1 分，上限 40
    if (task.createdAt) {
      const createDate = new Date(task.createdAt)
      createDate.setHours(0, 0, 0, 0)
      const daysSinceCreated = Math.max(0, (now - createDate) / (1000 * 60 * 60 * 24))
      cycleUrgency = Math.min(daysSinceCreated, 40)
    }

    // 如果有截止日且已过期，额外加 30 分（紧急提醒）
    if (task.deadline) {
      const deadlineDate = new Date(task.deadline)
      deadlineDate.setHours(0, 0, 0, 0)
      if (now > deadlineDate) {
        cycleUrgency += 30
      } else {
        // 距离截止日越近，额外加一些分
        const daysToDeadline = Math.max(0, (deadlineDate - now) / (1000 * 60 * 60 * 24))
        if (daysToDeadline <= 3) {
          cycleUrgency += (3 - daysToDeadline) * 10  // 临期 3 天内每天 +10
        }
      }
    }
  }

  // ---- 3. 推迟惩罚 ----
  // 每次"跳过今天"扣 20 分
  const postponePenalty = (task.postponeCount || 0) * 20

  // ---- 4. 汇总 ----
  const rawScore = baseScore + cycleUrgency - postponePenalty

  return Math.round(rawScore * 100) / 100
}

// ============================================================
// 第三部分：归一化 + 混合排序
// ============================================================

/**
 * Min-Max 归一化：将一组分数线性映射到 0~100
 *
 * 为什么需要归一化？
 * 求职任务和自定义任务的评分公式不同，原始分数范围也不同：
 *   - 求职：约 0~100
 *   - 自定义：可能 -80~120
 * 直接混合排序会不公平。归一化后两者都在 0~100 范围内，公平竞争。
 *
 * @param {number[]} scores - 原始分数数组
 * @returns {number[]} 归一化后的分数（0~100）
 */
function normalizeScores(scores) {
  if (scores.length === 0) return []
  if (scores.length === 1) return [50]

  // ≤3 个候选项时 Min-Max 归一化会导致极端拉伸，跳过归一化，直接 clamp
  if (scores.length <= 3) {
    return scores.map(s => Math.max(0, Math.min(100, s)))
  }

  const min = Math.min(...scores)
  const max = Math.max(...scores)

  if (max === min) return scores.map(() => 50)

  return scores.map(s => ((s - min) / (max - min)) * 100)
  // 公式：(原始值 - 最小值) / (最大值 - 最小值) × 100
  // 最低分 → 0，最高分 → 100，中间值按比例映射
}

// ============================================================
// 第四部分：多样性保护
// ============================================================

/**
 * 检查某类任务是否连续 3 天完全未上榜
 *
 * @param {string} type - 'job' | 'custom'
 * @param {Object[]} recentActions - 最近 N 天的 daily_actions 记录
 * @returns {boolean} true = 需要强制插入
 */
function needsDiversityBoost(type, recentActions) {
  // 按日期分组
  const actionsByDate = {}
  recentActions.forEach(action => {
    // daily_actions 的 date 字段是日期字符串 "YYYY-MM-DD"
    const dateKey = typeof action.date === 'string'
      ? action.date
      : new Date(action.date).toISOString().slice(0, 10)
    if (!actionsByDate[dateKey]) actionsByDate[dateKey] = new Set()
    // 检查该日是否有此类 action
    if (action.sourceType === type) {
      actionsByDate[dateKey].add(type)
    }
  })

  // 获取最近 3 天的日期列表
  const dates = []
  for (let i = 1; i <= 3; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    dates.push(d.toISOString().slice(0, 10))
  }

  // 检查这 3 天里该类是否至少出现过一次
  const hasAppeared = dates.some(date => actionsByDate[date] && actionsByDate[date].has(type))
  return !hasAppeared
}

/**
 * 强制插入被忽略类型的最高分候选项
 *
 * @param {Object[]} selected - 当前已选中的 Top N
 * @param {Object[]} allCandidates - 全部候选项（含分数）
 * @param {string} missingType - 'job' | 'custom'
 * @returns {Object[]} 调整后的选中列表
 */
function enforceDiversity(selected, allCandidates, missingType) {
  // 找到该类型中归一化分数最高的候选项
  const candidatesOfType = allCandidates
    .filter(c => c.sourceType === missingType)
    .sort((a, b) => b.normalizedScore - a.normalizedScore)

  if (candidatesOfType.length === 0) return selected

  const bestOfType = candidatesOfType[0]

  // 阈值保护：基础分不够 30 的不强制插入
  // 基础分的来源：
  //   求职：吸引力分（1-5）→ 转成 0-100 大约 = attractionScore/5 * 100
  //   任务：优先级分 20/50/80
  let baseScore = 0
  if (missingType === 'job') {
    baseScore = ((bestOfType.attractionScore || 1) / 5) * 100
  } else {
    const baseMap = { 1: 80, 2: 50, 3: 20 }
    baseScore = baseMap[bestOfType.priority] || 50
  }

  if (baseScore < 30) return selected  // 太差了，不强制

  // 替换掉当前选中的最低分项
  const sorted = [...selected].sort((a, b) => a.normalizedScore - b.normalizedScore)
  sorted[0] = bestOfType  // 最低分被替换

  return sorted
}

// ============================================================
// 第五部分：主入口 — 生成今日清单
// ============================================================

/**
 * 生成今日行动清单（纯函数，不操作数据库）
 *
 * 这是整个算法模块的入口。外部（云函数或前端）传入所有候选数据，
 * 函数返回排序后的 Top N 行动列表。
 *
 * @param {Object} options
 * @param {Object[]} options.jobs - 所有待处理的求职岗位（状态 ≠ Offer/已拒绝）
 * @param {Object[]} options.tasks - 所有启用的自定义任务
 * @param {Object[]} options.recentActions - 最近 7 天 daily_actions（用于多样性判断）
 * @param {number} [options.dailyLimit=5] - 每日清单条数上限
 * @param {Date|string} [options.today] - "今天"的日期
 * @returns {Object}
 *   - actions: 排序后的 Top N 行动列表
 *   - allCandidates: 全部候选项及得分（调试用）
 *   - diversityApplied: 是否触发了强制插入
 */
function generateDailyList(options) {
  const { jobs = [], tasks = [], recentActions = [], dailyLimit = 5, excludeSourceIds = [] } = options
  const today = options.today || new Date()

  // 今天的起止时戳，用于判断 lastCompletedAt 是否在今天之内
  const todayStart = new Date(today)
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(today)
  todayEnd.setHours(23, 59, 59, 999)

  // ---- Step 1: 计算每个岗位的分数 ----
  const scoredJobs = jobs
    .filter(job => !excludeSourceIds.includes(job._id))
    .map(job => ({
      sourceType: 'job',
      sourceId: job._id,
      company: job.company,
      position: job.position,
      status: job.status,
      attractionScore: job.attractionScore,
      preparednessScore: job.preparednessScore,
      priority: null,
      rawScore: calcJobScore(job, today)
    }))

  // ---- Step 2: 计算每个任务的分数 ----
  // 过滤：排除 excludeSourceIds 中的 + lastCompletedAt 在今天之内的
  const scoredTasks = tasks
    .filter(task => {
      if (excludeSourceIds.includes(task._id)) return false
      if (task.lastCompletedAt) {
        const completedAt = new Date(task.lastCompletedAt)
        if (completedAt >= todayStart && completedAt <= todayEnd) return false
      }
      return true
    })
    .map(task => ({
      sourceType: 'custom',
      sourceId: task._id,
      company: null,
      position: null,
      status: null,
    attractionScore: null,
    preparednessScore: null,
    priority: task.priority,
    title: task.title,
    note: task.note,
    estimatedMinutes: task.estimatedMinutes,
    repeatRule: task.repeatRule,
    rawScore: calcTaskScore(task, today)
  }))

  // ---- Step 3: 各自归一化 ----
  // 分别对求职和任务做归一化，保证两类在混合排序时公平
  const jobScores = scoredJobs.map(j => j.rawScore)
  const taskScores = scoredTasks.map(t => t.rawScore)
  const normalizedJobScores = normalizeScores(jobScores)
  const normalizedTaskScores = normalizeScores(taskScores)

  scoredJobs.forEach((item, i) => { item.normalizedScore = normalizedJobScores[i] })
  scoredTasks.forEach((item, i) => { item.normalizedScore = normalizedTaskScores[i] })

  // ---- Step 4: 混合排序 ----
  const allCandidates = [...scoredJobs, ...scoredTasks]
    .sort((a, b) => b.normalizedScore - a.normalizedScore)

  // ---- Step 5: 取 Top N ----
  let selected = allCandidates.slice(0, dailyLimit)

  // ---- Step 6: 多样性保护 ----
  // 检查 job 和 custom 是否连续 3 天未上榜
  let diversityApplied = false
  const jobTypes = ['job', 'custom']

  jobTypes.forEach(type => {
    // 检查当前选中的列表有没有该类
    const hasType = selected.some(item => item.sourceType === type)
    if (!hasType) {
      // 当前没选中 → 检查历史是否也缺失
      if (needsDiversityBoost(type, recentActions)) {
        const before = selected.length
        selected = enforceDiversity(selected, allCandidates, type)
        if (selected.length !== before) {
          diversityApplied = true
        }
      }
    }
  })

  // ---- Step 7: 为每条 action 生成描述文本 ----
  const actions = selected.map(item => {
    const action = {
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      title: '',
      description: '',
      normalizedScore: item.normalizedScore,
      rawScore: item.rawScore
    }

    if (item.sourceType === 'job') {
      // 根据岗位状态生成不同的行动文案
      action.title = item.status === '待投递'
        ? `投递简历`
        : item.status === '已投递' ? `跟进投递进度` : `准备面试`
      action.description = `${item.company} - ${item.position}`
    } else {
      action.title = item.title
      action.description = item.note || ''
    }

    return action
  })

  // 按归一化分降序排列最终结果
  actions.sort((a, b) => b.normalizedScore - a.normalizedScore)

  return {
    actions,
    allCandidates: allCandidates.map(c => ({
      sourceType: c.sourceType,
      sourceId: c.sourceId,
      title: c.title || `${c.company} - ${c.position}`,
      rawScore: c.rawScore,
      normalizedScore: c.normalizedScore
    })),
    diversityApplied
  }
}

// ============================================================
// 导出
// ============================================================
module.exports = {
  calcJobScore,
  calcTaskScore,
  normalizeScores,
  needsDiversityBoost,
  enforceDiversity,
  generateDailyList
}
