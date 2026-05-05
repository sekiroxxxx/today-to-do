// 更新自定义任务云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENVIRONMENT })
const db = cloud.database()

/**
 * updateTask 云函数
 *
 * 【功能说明】
 * 用户编辑已有任务后保存。白名单方式只更新允许修改的字段，
 * 防止前端意外修改 postponeCount 等系统维护的字段。
 *
 * 【调用方式（前端）】
 * wx.cloud.callFunction({
 *   name: 'updateTask',
 *   data: {
 *     taskId: '对应的_id',
 *     title: '新标题',
 *     enabled: false   // 禁用该任务，不再出现在每日清单
 *   }
 * })
 *
 * 【入参说明】
 * taskId - 必填，任务 _id
 * 以下选填，传了就更新：
 *   title, note, priority, estimatedMinutes, deadline,
 *   repeatRule: { type, daysOfWeek }, enabled
 *
 * 【出参】
 * { success: true, task: { _id, title, ... } }
 */
exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID

  // ========== 第1步：校验 taskId ==========
  if (!event.taskId) {
    return { success: false, errMsg: '缺少任务 ID' }
  }

  try {
    // ========== 第2步：确认任务属于当前用户 ==========
    const existResult = await db.collection('custom_tasks')
      .where({ _id: event.taskId, _openid: openid })
      .get()

    if (existResult.data.length === 0) {
      return { success: false, errMsg: '任务不存在或无权修改' }
    }

    // ========== 第3步：构建更新字段（白名单） ==========
    const updateData = {}
    const allowedFields = [
      'title', 'note', 'priority',
      'estimatedMinutes', 'deadline',
      'repeatRule', 'enabled'
    ]

    allowedFields.forEach(field => {
      if (event[field] !== undefined) {
        // 字符串字段做 trim，对象/布尔值/数字直接赋值
        if (typeof event[field] === 'string') {
          updateData[field] = event[field].trim()
        } else {
          updateData[field] = event[field]
        }
      }
    })

    // ========== 第4步：校验更新的字段值 ==========
    // 优先级范围
    if (updateData.priority !== undefined) {
      if (![1, 2, 3].includes(updateData.priority)) {
        return { success: false, errMsg: '优先级只能为 1(高)、2(中)、3(低)' }
      }
    }

    // 预计耗时不可是负数
    if (updateData.estimatedMinutes !== undefined && updateData.estimatedMinutes < 0) {
      return { success: false, errMsg: '预计耗时不能为负数' }
    }

    // 重复规则校验
    if (updateData.repeatRule) {
      const rr = updateData.repeatRule
      const validTypes = ['none', 'daily', 'weekly']
      if (!validTypes.includes(rr.type)) {
        return { success: false, errMsg: `重复类型只能为：${validTypes.join('、')}` }
      }
      if (rr.type === 'weekly') {
        if (!Array.isArray(rr.daysOfWeek) || rr.daysOfWeek.length === 0) {
          return { success: false, errMsg: '每周重复任务必须选择至少一个星期几' }
        }
        const allValid = rr.daysOfWeek.every(d => d >= 1 && d <= 7)
        if (!allValid) {
          return { success: false, errMsg: 'daysOfWeek 必须是 1-7 的整数' }
        }
        rr.daysOfWeek = rr.daysOfWeek.sort((a, b) => a - b)
      }
    }

    // ========== 第5步：检查是否有字段要更新 ==========
    if (Object.keys(updateData).length === 0) {
      return { success: false, errMsg: '没有需要更新的字段' }
    }

    updateData.updatedAt = db.serverDate()

    // ========== 第6步：执行更新并返回 ==========
    await db.collection('custom_tasks')
      .doc(event.taskId)
      .update({ data: updateData })

    const updated = await db.collection('custom_tasks')
      .doc(event.taskId)
      .get()

    console.log('任务更新成功:', openid, event.taskId, Object.keys(updateData).join(', '))

    return {
      success: true,
      task: updated.data
    }

  } catch (error) {
    console.error('updateTask 执行失败:', error)
    return {
      success: false,
      errMsg: error.message || '更新任务失败'
    }
  }
}
