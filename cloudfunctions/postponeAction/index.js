// 推迟行动云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENVIRONMENT })
const db = cloud.database()

/**
 * postponeAction 云函数
 *
 * 【功能说明】
 * 用户在首页点击"推迟 ⏳"按钮后调用。
 * 支持两种推迟模式（从 PRD 评审后新增的细化需求）：
 *
 *   "稍后提醒" (later)：
 *     - 当日 session 内降权（前端维护，本函数不处理）
 *     - 不触发跨天惩罚
 *     - 标记 daily_action 为 postponed
 *
 *   "跳过今天" (skip)：
 *     - 标记 daily_action 为 postponed
 *     - 源任务的 postponeCount += 1（影响明天及以后的算法分数）
 *     - 求职岗位的 nextActionDate 顺延 1 天
 *
 * 【调用方式（前端）】
 * wx.cloud.callFunction({
 *   name: 'postponeAction',
 *   data: {
 *     actionId: 'daily_actions的_id',
 *     postponeType: 'skip'  // 'later' | 'skip'
 *   }
 * })
 *
 * 【入参】
 * actionId     - 必填
 * postponeType - 必填，'later'(稍后提醒) | 'skip'(跳过今天)
 *
 * 【出参】
 * { success: true, needRegenerate: true }
 * // needRegenerate=true 表示前端应调 generateDailyActions 补入备选
 */
exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID

  // ========== 第1步：参数校验 ==========
  if (!event.actionId) {
    return { success: false, errMsg: '缺少 action ID' }
  }
  const validTypes = ['later', 'skip']
  if (!event.postponeType || !validTypes.includes(event.postponeType)) {
    return { success: false, errMsg: `postponeType 必须为 'later'(稍后提醒) 或 'skip'(跳过今天)` }
  }

  try {
    // ========== 第2步：查找 action 确认归属 ==========
    const actionResult = await db.collection('daily_actions')
      .where({ _id: event.actionId, _openid: openid })
      .get()

    if (actionResult.data.length === 0) {
      return { success: false, errMsg: '行动记录不存在' }
    }

    const action = actionResult.data[0]

    // 已完成的不能推迟
    if (action.completed) {
      return { success: false, errMsg: '已完成的行动不能推迟' }
    }

    // ========== 第3步：标记 daily_action 为已推迟 ==========
    await db.collection('daily_actions')
      .doc(event.actionId)
      .update({
        data: { postponed: true }
      })

    // ========== 第4步：如果是"跳过今天"，更新源任务 ==========
    if (event.postponeType === 'skip') {
      const now = db.serverDate()

      if (action.sourceType === 'job') {
        // 求职岗位：推迟次数 +1，nextActionDate 顺延 1 天
        // 使用 db.command.inc 做原子递增
        const jobResult = await db.collection('job_applications')
          .doc(action.sourceId)
          .get()

        if (jobResult.data) {
          const currentNextDate = jobResult.data.nextActionDate
            ? new Date(jobResult.data.nextActionDate)
            : new Date()

          // 顺延 1 天
          currentNextDate.setDate(currentNextDate.getDate() + 1)

          await db.collection('job_applications')
            .doc(action.sourceId)
            .update({
              data: {
                postponeCount: db.command.inc(1),   // 原子递增
                nextActionDate: currentNextDate,
                updatedAt: now
              }
            })
        }
      } else if (action.sourceType === 'custom') {
        // 自定义任务：推迟次数 +1
        await db.collection('custom_tasks')
          .doc(action.sourceId)
          .update({
            data: {
              postponeCount: db.command.inc(1),
              updatedAt: now
            }
          })
      }

      console.log('跳过今天:', openid, action.sourceType, action.sourceId)
    } else {
      console.log('稍后提醒:', openid, action.sourceType, action.sourceId)
    }

    // ========== 第5步：返回，让前端决定是否补入备选 ==========
    // needRegenerate: true 告诉前端：当前列表少了一条，
    // 你可以调 generateDailyActions(forceRegenerate:true) 补入新的
    return {
      success: true,
      postponeType: event.postponeType,
      needRegenerate: true
    }

  } catch (error) {
    console.error('postponeAction 执行失败:', error)
    return {
      success: false,
      errMsg: error.message || '操作失败'
    }
  }
}
