// 生成今日行动清单云函数（核心）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENVIRONMENT })
const db = cloud.database()
const _ = db.command

// 导入算法模块（同一个云函数目录下的 utils/algorithm.js）
const algorithm = require('./utils/algorithm')

/**
 * generateDailyActions 云函数
 *
 * 【功能说明】
 * 这是整个小程序的"大脑"。
 * 用户每天首次打开首页或下拉刷新时调用。
 * 函数做的事情：
 *   1. 从数据库拉取所有候选（求职岗位 + 自定义任务）
 *   2. 丢给算法模块排序打分
 *   3. 把结果写入 daily_actions 集合（当天的清单）
 *   4. 返回 Top 3~5 条行动
 *
 * 【调用方式（前端）】
 * // 普通调用（有缓存时直接返回）
 * wx.cloud.callFunction({ name: 'generateDailyActions', data: {} })
 *
 * // 强制重新生成（下拉刷新时用）
 * wx.cloud.callFunction({ name: 'generateDailyActions', data: { forceRegenerate: true } })
 *
 * 【出参】
 * {
 *   success: true,
 *   actions: [{ sourceType, sourceId, title, description, normalizedScore }, ...],
 *   generated: true,       // true=新生成, false=返回缓存
 *   diversityApplied: false // 是否触发了多样性强制插入
 * }
 */
exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID
  const todayDate = getDateString(new Date())  // "2026-05-05"

  try {
    // 今天已处理（完成/推迟）的源任务 ID，重新生成时不覆盖这些
    let retainedSourceIds = []

    // ========== 第1步：检查是否已有今日清单（缓存逻辑） ==========
    if (!event.forceRegenerate) {
      const existingResult = await db.collection('daily_actions')
        .where({
          _openid: openid,
          date: todayDate
        })
        .orderBy('normalizedScore', 'desc')
        .get()

      if (existingResult.data.length > 0) {
        console.log('今日清单已存在，返回缓存:', openid)
        return {
          success: true,
          actions: existingResult.data,
          generated: false,
          diversityApplied: false,
          date: todayDate
        }
      }
    } else {
      // 强制重新生成：保留已完成/已推迟的记录（不当幽灵删掉），只清理未处理的
      const todayRecords = await db.collection('daily_actions')
        .where({ _openid: openid, date: todayDate })
        .get()

      // 已处理（完成/推迟）的记录 → 保留，后续插入时跳过同名 sourceId
      retainedSourceIds = todayRecords.data
        .filter(a => a.completed || a.postponed)
        .map(a => a.sourceId)

      // 只删除未处理的记录（waiting 状态）
      const toDelete = todayRecords.data.filter(a => !a.completed && !a.postponed)
      for (const record of toDelete) {
        await db.collection('daily_actions').doc(record._id).remove()
      }

      console.log('强制重新生成 — 保留已完成/推迟:', retainedSourceIds.length, '删除未处理:', toDelete.length)
    }

    // ========== 第2步：获取用户偏好 ==========
    const userResult = await db.collection('users')
      .where({ _openid: openid })
      .get()
    const dailyLimit = (userResult.data[0] && userResult.data[0].preferences)
      ? (userResult.data[0].preferences.dailyLimit || 5)
      : 5

    // ========== 第3步：拉取所有候选任务 ==========
    // 只拉取当前用户的数据，一次拉全部让算法模块处理

    // 3a. 求职岗位：排除终态（Offer 和已拒绝不再出现在清单里）
    const jobsResult = await db.collection('job_applications')
      .where({
        _openid: openid,
        status: _.nin(['Offer', '已拒绝'])  // 不是终态的岗位才考虑
      })
      .get()

    // 3b. 自定义任务：只取启用的
    const tasksResult = await db.collection('custom_tasks')
      .where({
        _openid: openid,
        enabled: true
      })
      .get()

    // ========== 第4步：拉取最近 7 天历史（用于多样性判断） ==========
    // 计算 7 天前的日期字符串
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const startDate = getDateString(sevenDaysAgo)

    const recentResult = await db.collection('daily_actions')
      .where({
        _openid: openid,
        date: _.gte(startDate)  // >= 7 天前
      })
      .get()

    // ========== 第5步：调用算法模块生成清单 ==========
    const result = algorithm.generateDailyList({
      jobs: jobsResult.data,
      tasks: tasksResult.data,
      recentActions: recentResult.data,
      dailyLimit: dailyLimit,
      excludeSourceIds: retainedSourceIds || []
    })

    console.log(`算法生成完成: ${result.actions.length} 条, 多样性修正: ${result.diversityApplied}`)

    // ========== 第6步：将结果写入 daily_actions 集合 ==========
    const now = db.serverDate()

    // 构建 sourceId → module 映射（自定义任务的模块来源）
    const taskModuleMap = {}
    tasksResult.data.forEach(t => { taskModuleMap[t._id] = t.module || 'custom' })

    // 过滤：跳过已保留的 sourceId
    const newActions = result.actions.filter(a => !retainedSourceIds.includes(a.sourceId))
    const insertPromises = newActions.map(action => {
      // 求职 → 'jobseeker'，自定义 → 从源任务取 module，兜底 'custom'
      const module = action.sourceType === 'job'
        ? 'jobseeker'
        : (taskModuleMap[action.sourceId] || 'custom')

      return db.collection('daily_actions').add({
        data: {
          _openid: openid,
          date: todayDate,
          sourceType: action.sourceType,
          sourceId: action.sourceId,
          module: module,
          title: action.title,
          description: action.description,
          normalizedScore: action.normalizedScore,
          rawScore: action.rawScore,
          completed: false,
          postponed: false,
          completedAt: null,
          generatedAt: now
        }
      })
    })

    // 并行写入所有 action 记录
    await Promise.all(insertPromises)

    // ========== 第7步：读取待处理记录（排除已完成/推迟）并返回 ==========
    const finalResult = await db.collection('daily_actions')
      .where({ _openid: openid, date: todayDate, completed: false, postponed: false })
      .orderBy('normalizedScore', 'desc')
      .get()

    console.log('generateDailyActions 完成:', openid, '生成', finalResult.data.length, '条')

    return {
      success: true,
      actions: finalResult.data,
      generated: true,
      diversityApplied: result.diversityApplied,
      date: todayDate
    }

  } catch (error) {
    console.error('generateDailyActions 执行失败:', error)
    return {
      success: false,
      errMsg: error.message || '生成今日清单失败，请稍后重试'
    }
  }
}

/**
 * 日期转字符串工具：Date → "YYYY-MM-DD"
 */
function getDateString(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
