// 完成行动云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENVIRONMENT })
const db = cloud.database()

/**
 * completeAction 云函数
 *
 * 【功能说明】
 * 用户在首页点击"完成 ✅"按钮后调用。
 * 做的事情：
 *   1. 标记 daily_actions 记录为已完成
 *   2. 如果来源是自定义任务 → 更新源任务的 lastCompletedAt，重置推迟次数
 *   3. 如果来源是求职岗位 → 返回岗位信息，让前端决定是否同步推进状态
 *
 * 【调用方式（前端）】
 * wx.cloud.callFunction({
 *   name: 'completeAction',
 *   data: { actionId: 'daily_actions的_id' }
 * })
 *
 * 【出参】
 * {
 *   success: true,
 *   sourceType: 'job' | 'custom',
 *   // sourceType=job 时返回，供前端弹窗询问是否推进状态
 *   jobInfo: { _id, status, company, position },
 *   // sourceType=custom 时返回
 *   taskInfo: { _id, title, repeatRule }
 * }
 */
exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID

  if (!event.actionId) {
    return { success: false, errMsg: '缺少 action ID' }
  }

  try {
    // ========== 第1步：查找 action 记录，确认归属 ==========
    const actionResult = await db.collection('daily_actions')
      .where({ _id: event.actionId, _openid: openid })
      .get()

    if (actionResult.data.length === 0) {
      return { success: false, errMsg: '行动记录不存在' }
    }

    const action = actionResult.data[0]

    // 防止重复完成
    if (action.completed) {
      return { success: false, errMsg: '该行动已经完成了' }
    }

    const now = db.serverDate()

    // ========== 第2步：标记 daily_action 为已完成 ==========
    await db.collection('daily_actions')
      .doc(event.actionId)
      .update({
        data: {
          completed: true,
          completedAt: now
        }
      })

    const response = {
      success: true,
      sourceType: action.sourceType
    }

    // ========== 第3步：根据来源类型更新源任务 ==========
    if (action.sourceType === 'custom') {
      // 自定义任务：更新 lastCompletedAt，重置推迟次数
      await db.collection('custom_tasks')
        .doc(action.sourceId)
        .update({
          data: {
            lastCompletedAt: now,
            postponeCount: 0,
            updatedAt: now
          }
        })

      // 返回任务信息，前端可以展示"完成！下次: 明天"之类的提示
      const taskResult = await db.collection('custom_tasks')
        .doc(action.sourceId)
        .get()

      response.taskInfo = {
        _id: taskResult.data._id,
        title: taskResult.data.title,
        repeatRule: taskResult.data.repeatRule
      }

      console.log('任务完成:', openid, taskResult.data.title)

    } else if (action.sourceType === 'job') {
      // 求职岗位：只返回岗位信息给前端
      // 前端收到后弹窗："是否同步更新岗位状态？"
      // 如果用户选"是"，前端再调 updateJobStatus
      const jobResult = await db.collection('job_applications')
        .doc(action.sourceId)
        .get()

      response.jobInfo = {
        _id: jobResult.data._id,
        status: jobResult.data.status,
        company: jobResult.data.company,
        position: jobResult.data.position
      }

      console.log('求职行动完成:', openid, jobResult.data.company, jobResult.data.position)
    }

    return response

  } catch (error) {
    console.error('completeAction 执行失败:', error)
    return {
      success: false,
      errMsg: error.message || '操作失败'
    }
  }
}
