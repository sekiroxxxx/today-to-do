// 删除求职岗位云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENVIRONMENT })
const db = cloud.database()

/**
 * deleteJob 云函数
 *
 * 【功能说明】
 * 用户删除一个求职岗位。先校验该岗位属于当前用户，再执行删除。
 * 删除操作不可逆，前端应做二次确认弹窗。
 *
 * 【调用方式（前端）】
 * wx.cloud.callFunction({
 *   name: 'deleteJob',
 *   data: { jobId: '对应的_id' }
 * })
 *
 * 【入参】
 * jobId - 必填，要删除的岗位 _id
 *
 * 【出参】
 * { success: true }  或  { success: false, errMsg: '...' }
 */
exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID

  // ========== 第1步：校验入参 ==========
  if (!event.jobId) {
    return { success: false, errMsg: '缺少岗位 ID' }
  }

  try {
    // ========== 第2步：确认岗位存在且属于当前用户 ==========
    // 先查再删，防止误删和越权
    const existResult = await db.collection('job_applications')
      .where({ _id: event.jobId, _openid: openid })
      .get()

    if (existResult.data.length === 0) {
      return { success: false, errMsg: '岗位不存在或无权删除' }
    }

    // ========== 第3步：执行删除 ==========
    // 先清理 daily_actions 中引用该岗位的幽灵卡片
    await db.collection('daily_actions')
      .where({ sourceId: event.jobId })
      .remove()

    // 再删源记录
    await db.collection('job_applications')
      .doc(event.jobId)
      .remove()

    console.log('岗位删除成功:', openid, event.jobId)

    return { success: true }

  } catch (error) {
    console.error('deleteJob 执行失败:', error)
    return { success: false, errMsg: error.message || '删除岗位失败' }
  }
}
