// 更新用户偏好云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENVIRONMENT })
const db = cloud.database()

/**
 * updatePreference 云函数
 *
 * 【功能说明】
 * 更新 users 集合中当前用户的偏好设置。
 * 目前仅支持 dailyLimit（每日清单条数上限，3~5）。
 * v1.1 可扩展更多偏好字段（pushEnabled、persona、modules 等）。
 *
 * 【调用方式（前端）】
 * wx.cloud.callFunction({
 *   name: 'updatePreference',
 *   data: { dailyLimit: 3 }
 * })
 *
 * 【入参】dailyLimit - 必填，3~5 的整数
 * 【出参】{ success: true }
 */
exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID

  // ========== 校验 ==========
  const dailyLimit = Number(event.dailyLimit)
  if (!dailyLimit || dailyLimit < 1 || dailyLimit > 10) {
    return { success: false, errMsg: '每日求职推荐上限需为 1~10' }
  }

  try {
    // ========== 更新 ==========
    await db.collection('users').where({ _openid: openid }).update({
      data: { 'preferences.dailyLimit': dailyLimit }
    })

    console.log('偏好更新:', openid, 'dailyLimit:', dailyLimit)
    return { success: true, dailyLimit }

  } catch (error) {
    console.error('updatePreference 执行失败:', error)
    return { success: false, errMsg: error.message || '更新失败' }
  }
}
