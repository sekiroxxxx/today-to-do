// 删除自定义任务云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENVIRONMENT })
const db = cloud.database()

/**
 * deleteTask 云函数
 *
 * 【功能说明】
 * 删除一条自定义任务。先校验归属，再执行删除。
 * 删除不可逆，前端应做二次确认弹窗。
 *
 * 【调用方式（前端）】
 * wx.cloud.callFunction({ name: 'deleteTask', data: { taskId: '对应的_id' } })
 *
 * 【入参】taskId - 必填
 * 【出参】{ success: true } 或 { success: false, errMsg: '...' }
 */
exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID

  if (!event.taskId) {
    return { success: false, errMsg: '缺少任务 ID' }
  }

  try {
    // ========== 归属校验 ==========
    const existResult = await db.collection('custom_tasks')
      .where({ _id: event.taskId, _openid: openid })
      .get()

    if (existResult.data.length === 0) {
      return { success: false, errMsg: '任务不存在或无权删除' }
    }

    // ========== 执行删除 ==========
    // 先清理 daily_actions 中引用该任务的幽灵卡片
    await db.collection('daily_actions')
      .where({ sourceId: event.taskId })
      .remove()

    // 再删源记录
    await db.collection('custom_tasks').doc(event.taskId).remove()

    console.log('任务删除成功:', openid, event.taskId)
    return { success: true }

  } catch (error) {
    console.error('deleteTask 执行失败:', error)
    return { success: false, errMsg: error.message || '删除任务失败' }
  }
}
