// 获取统计数据云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENVIRONMENT })
const db = cloud.database()
const _ = db.command

/**
 * getStats 云函数
 *
 * 【功能说明】
 * 用户在"我的"页面查看统计数据时调用。
 * 返回两部分数据：
 *   1. 行动统计：指定时间范围内的完成数、推迟数、完成率、每日明细
 *   2. 投递漏斗：岗位按状态分组的数量（待投递→已投递→面试→Offer）
 *
 * 【调用方式（前端）】
 * wx.cloud.callFunction({ name: 'getStats', data: { range: 'week' } })
 * wx.cloud.callFunction({ name: 'getStats', data: { range: 'month' } })
 *
 * 【出参】
 * {
 *   success: true,
 *   range: 'week',
 *   startDate: '2026-04-28',
 *   endDate: '2026-05-05',
 *   summary: { total: 15, completed: 10, postponed: 5, completionRate: 0.67 },
 *   funnel: { pending: 5, applied: 3, interviewing: 2, offer: 1 },
 *   dailyDetail: [{ date: '2026-05-05', completed: 3, postponed: 1, total: 4 }, ...]
 * }
 */
exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID

  // ========== 第1步：确定查询时间范围 ==========
  const range = (event.range === 'month') ? 'month' : 'week'
  const days = range === 'month' ? 30 : 7

  const endDate = new Date()
  endDate.setHours(23, 59, 59, 999)  // 当天结束时刻

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - (days - 1))  // 30 天前或 7 天前
  startDate.setHours(0, 0, 0, 0)  // 当天开始时刻

  const startDateStr = getDateString(startDate)
  const endDateStr = getDateString(endDate)

  try {
    // ========== 第2步：查询时间范围内的 daily_actions ==========
    const actionsResult = await db.collection('daily_actions')
      .where({
        _openid: openid,
        date: _.gte(startDateStr).and(_.lte(endDateStr))
      })
      .get()

    const actions = actionsResult.data

    // ========== 第3步：聚合计算 ==========
    const completed = actions.filter(a => a.completed).length
    const postponed = actions.filter(a => a.postponed && !a.completed).length
    // 注意：一条 action 可能先被推迟后被完成，算在 completed 里
    const total = actions.length
    const completionRate = total > 0 ? Math.round((completed / total) * 100) / 100 : 0

    // ---- 按日期分组统计每日明细 ----
    const dailyMap = {}
    // 初始化所有日期为 0（即使没有记录的日期也返回，方便前端画连续图表）
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + i)
      const key = getDateString(d)
      dailyMap[key] = { date: key, completed: 0, postponed: 0, total: 0 }
    }

    actions.forEach(a => {
      if (dailyMap[a.date]) {
        dailyMap[a.date].total++
        if (a.completed) dailyMap[a.date].completed++
        if (a.postponed && !a.completed) dailyMap[a.date].postponed++
      }
    })

    const dailyDetail = Object.values(dailyMap)

    // ========== 第4步：投递漏斗 ==========
    // 按 status 分组计数
    const jobsResult = await db.collection('job_applications')
      .where({ _openid: openid })
      .get()

    const funnel = {
      pending: 0,        // 待投递
      applied: 0,        // 已投递
      interviewing: 0,   // 面试中
      offer: 0,          // Offer
      rejected: 0        // 已拒绝
    }

    jobsResult.data.forEach(job => {
      switch (job.status) {
        case '待投递': funnel.pending++; break
        case '已投递': funnel.applied++; break
        case '面试中': funnel.interviewing++; break
        case 'Offer': funnel.offer++; break
        case '已拒绝': funnel.rejected++; break
      }
    })

    // ========== 第5步：分类占比（求职 vs 自定义） ==========
    const jobActions = actions.filter(a => a.sourceType === 'job')
    const customActions = actions.filter(a => a.sourceType === 'custom')
    const categoryBreakdown = {
      job: { total: jobActions.length, completed: jobActions.filter(a => a.completed).length },
      custom: { total: customActions.length, completed: customActions.filter(a => a.completed).length }
    }

    console.log('统计完成:', openid, range, '总记录:', total)

    return {
      success: true,
      range,
      startDate: startDateStr,
      endDate: endDateStr,
      summary: {
        total,
        completed,
        postponed,
        completionRate
      },
      funnel,
      categoryBreakdown,
      dailyDetail
    }

  } catch (error) {
    console.error('getStats 执行失败:', error)
    return {
      success: false,
      errMsg: error.message || '获取统计数据失败'
    }
  }
}

function getDateString(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
