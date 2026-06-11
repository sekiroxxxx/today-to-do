// 添加自定义任务云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENVIRONMENT })
const db = cloud.database()

/**
 * addTask 云函数
 *
 * 【功能说明】
 * 用户在"任务管理"页面创建一条自定义任务。
 * 支持设置优先级、预计耗时、截止日、重复规则。
 * 和求职岗位不同：任务没有"状态流转"，只有"完成"和"推迟"。
 *
 * 【调用方式（前端）】
 * wx.cloud.callFunction({
 *   name: 'addTask',
 *   data: {
 *     title: '刷 LeetCode 三道题',
 *     priority: 1,            // 1=高, 2=中, 3=低
 *     estimatedMinutes: 60,   // 预计耗时（分钟）
 *     deadline: '2026-05-10',
 *     repeatRule: {           // 重复规则
 *       type: 'weekly',       // 'none'(不重复) | 'daily'(每天) | 'weekly'(每周)
 *       daysOfWeek: [1, 3, 5] // type=weekly 时，周一三五；1=周一，7=周日
 *     }
 *   }
 * })
 *
 * 【入参说明】
 * title            - 必填，任务标题
 * note             - 选填，备注
 * priority         - 选填，优先级：1=高, 2=中, 3=低。默认 2
 * estimatedMinutes - 选填，预计耗时（分钟），不传为 0
 * deadline         - 选填，截止日期 "YYYY-MM-DD"
 * repeatRule.type  - 选填，'none'(默认) | 'daily' | 'weekly'
 * repeatRule.daysOfWeek - 选填，仅 weekly 时有效：[1, 2, 3, 4, 5, 6, 7]
 *
 * 【出参】
 * { success: true, task: { _id, title, priority, ... } }
 */
exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID

  // ========== 第1步：校验必填字段 ==========
  if (!event.title || !event.title.trim()) {
    return { success: false, errMsg: '任务标题不能为空' }
  }

  // ========== 第2步：校验优先级 ==========
  const priority = Number(event.priority) || 2  // 默认中优先级
  if (![1, 2, 3].includes(priority)) {
    return { success: false, errMsg: '优先级只能为 1(高)、2(中)、3(低)' }
  }

  // ========== 第3步：校验并构建重复规则 ==========
  // repeatRule 决定了任务完成后是否自动生成下一次
  // type: 'none'   → 一次性任务，完成后不再出现
  // type: 'daily'  → 每天都会出现在清单里
  // type: 'weekly' → 只在 daysOfWeek 指定的几天出现
  const validTypes = ['none', 'daily', 'weekly']
  let repeatRule = {
    type: 'none',     // 默认不重复
    daysOfWeek: []    // 仅 weekly 时使用
  }

  if (event.repeatRule && event.repeatRule.type) {
    const type = event.repeatRule.type
    if (!validTypes.includes(type)) {
      return { success: false, errMsg: `重复类型只能为：${validTypes.join('、')}` }
    }
    repeatRule.type = type

    // 如果选了每周重复，校验 daysOfWeek
    if (type === 'weekly') {
      const days = event.repeatRule.daysOfWeek || []
      // 必须是数组，且每个元素在 1-7 之间
      if (!Array.isArray(days) || days.length === 0) {
        return { success: false, errMsg: '每周重复任务必须选择至少一个星期几' }
      }
      const allValid = days.every(d => Number.isInteger(d) && d >= 1 && d <= 7)
      if (!allValid) {
        return { success: false, errMsg: 'daysOfWeek 必须是 1-7 的整数（1=周一，7=周日）' }
      }
      repeatRule.daysOfWeek = days.sort((a, b) => a - b)  // 排序方便阅读
    }
  }

  // ========== 第4步：校验其他选填字段 ==========
  const estimatedMinutes = Number(event.estimatedMinutes) || 0
  if (estimatedMinutes < 0) {
    return { success: false, errMsg: '预计耗时不能为负数' }
  }

  // ========== 第5步：组装数据 ==========
  const now = db.serverDate()
  const taskData = {
    _openid: openid,

    // 基本信息
    title: event.title.trim(),
    note: (event.note || '').trim(),
    priority: priority,
    module: event.module || 'custom',  // v1.1 模块归属，默认自定义
    estimatedMinutes: estimatedMinutes,
    deadline: event.deadline || '',

    // 重复配置
    repeatRule: repeatRule,

    // 状态字段
    enabled: true,               // 是否启用（关闭后不会出现在每日清单里）
    postponeCount: 0,            // 连续推迟次数（每次"跳过今天"+1，完成后重置）
    lastCompletedAt: null,       // 上次完成时间（用于计算周期紧迫分）

    // 时间戳
    createdAt: now,
    updatedAt: now
  }

  // ========== 第6步：写入数据库 ==========
  try {
    const result = await db.collection('custom_tasks').add({
      data: taskData
    })

    taskData._id = result._id

    console.log('任务添加成功:', openid, taskData.title, '优先级:', taskData.priority)

    return {
      success: true,
      task: taskData
    }
  } catch (error) {
    console.error('addTask 执行失败:', error)
    return {
      success: false,
      errMsg: error.message || '添加任务失败'
    }
  }
}
