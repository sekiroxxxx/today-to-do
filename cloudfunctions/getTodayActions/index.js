// 获取今日行动清单云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENVIRONMENT })
const db = cloud.database()

/**
 * getTodayActions 云函数
 *
 * 【功能说明】
 * 用户打开首页时调用，读取今天已生成的行动清单。
 * 如果今天还没生成过（返回空数组），前端应接着调用 generateDailyActions。
 *
 * 设计意图：读和写分离。getTodayActions 只负责查询，
 * generateDailyActions 只负责生成。前端逻辑清晰：
 *
 *   onShow() {
 *     getTodayActions()  →  有数据就渲染
 *                       →  没数据就调 generateDailyActions → 再渲染
 *   }
 *
 * 【调用方式（前端）】
 * wx.cloud.callFunction({ name: 'getTodayActions', data: {} })
 *
 * 【出参】
 * {
 *   success: true,
 *   actions: [...],   // 今日清单，无数据时为空数组
 *   date: "2026-05-05"
 * }
 */
exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID
  const todayDate = getDateString(new Date())

  try {
    // ========== 查询今天的 daily_actions ==========
    // 过滤掉已完成和已跳过的记录，只展示待处理的
    const result = await db.collection('daily_actions')
      .where({
        _openid: openid,
        date: todayDate,
        completed: false,
        postponed: false
      })
      .orderBy('normalizedScore', 'desc')
      .get()

    console.log(`今日清单查询: ${openid}, ${result.data.length} 条`)

    return {
      success: true,
      actions: result.data,
      date: todayDate
    }

  } catch (error) {
    console.error('getTodayActions 执行失败:', error)
    return {
      success: false,
      errMsg: error.message || '获取今日清单失败'
    }
  }
}

function getDateString(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
