// 更新求职岗位云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENVIRONMENT })
const db = cloud.database()

/**
 * updateJob 云函数
 *
 * 【功能说明】
 * 用户在"求职管理"页面编辑岗位信息后，点击保存，前端调用此函数。
 * 注意：这里只修改基本信息（公司名、岗位、薪资等），
 * 状态变更需要用 updateJobStatus 函数（保证状态时间轴正确记录）。
 *
 * 【调用方式（前端）】
 * wx.cloud.callFunction({
 *   name: 'updateJob',
 *   data: {
 *     jobId: '对应的_id',
 *     company: '字节跳动（改后）',
 *     position: '高级前端工程师',
 *     attractionScore: 4
 *   }
 * })
 *
 * 【入参说明】
 * jobId             - 必填，要修改的岗位 _id
 * 以下字段全部选填，传了就更新，不传保持原值：
 * company, position, salaryRange, applyLink, deadline,
 * attractionScore, preparednessScore
 *
 * 【出参】
 * {
 *   success: true,
 *   job: { _id, company, position, ... }  // 更新后的完整岗位信息
 * }
 */
exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID

  // ========== 第1步：校验 jobId ==========
  // 没有 _id 就无法定位要修改哪条记录
  if (!event.jobId) {
    return { success: false, errMsg: '缺少岗位 ID' }
  }

  try {
    // ========== 第2步：确认这条数据属于当前用户 ==========
    // 同时用 _id 和 _openid 查询，防止用户修改别人的数据
    const existResult = await db.collection('job_applications')
      .where({
        _id: event.jobId,
        _openid: openid
      })
      .get()

    if (existResult.data.length === 0) {
      return { success: false, errMsg: '岗位不存在或无权修改' }
    }

    // ========== 第3步：白名单方式构建要更新的字段 ==========
    // 只提取允许修改的字段，前端多传的任何字段都会被忽略
    // 这样防止前端意外修改 status、statusHistory 等敏感字段
    const updateData = {}

    const allowedFields = [
      'company', 'position', 'salaryRange',
      'applyLink', 'deadline',
      'attractionScore', 'preparednessScore'
    ]

    allowedFields.forEach(field => {
      // 只有前端确实传了这个字段才加入更新
      if (event[field] !== undefined) {
        updateData[field] = event[field].trim ? event[field].trim() : event[field]
      }
    })

    // ========== 第4步：如果修改了评分，校验范围 ==========
    if (updateData.attractionScore !== undefined) {
      const score = Number(updateData.attractionScore)
      if (score < 1 || score > 5) {
        return { success: false, errMsg: '吸引力评分必须在 1-5 之间' }
      }
      updateData.attractionScore = score
    }
    if (updateData.preparednessScore !== undefined) {
      const score = Number(updateData.preparednessScore)
      if (score < 1 || score > 5) {
        return { success: false, errMsg: '准备度评分必须在 1-5 之间' }
      }
      updateData.preparednessScore = score
    }

    // ========== 第5步：检查是否真的有字段要更新 ==========
    if (Object.keys(updateData).length === 0) {
      return { success: false, errMsg: '没有需要更新的字段' }
    }

    // 自动更新 updatedAt 时间戳
    updateData.updatedAt = db.serverDate()

    // ========== 第6步：执行数据库更新 ==========
    await db.collection('job_applications')
      .doc(event.jobId)
      .update({
        data: updateData
      })

    // ========== 第7步：查询并返回更新后的完整记录 ==========
    const updated = await db.collection('job_applications')
      .doc(event.jobId)
      .get()

    console.log('岗位更新成功:', openid, event.jobId, Object.keys(updateData).join(', '))

    return {
      success: true,
      job: updated.data
    }

  } catch (error) {
    console.error('updateJob 执行失败:', error)
    return {
      success: false,
      errMsg: error.message || '更新岗位失败'
    }
  }
}
