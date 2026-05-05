// 推进求职岗位状态云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENVIRONMENT })
const db = cloud.database()

/**
 * updateJobStatus 云函数
 *
 * 【功能说明】
 * 用户在"求职管理"页面点击推进按钮，或者完成一个 action 后选择同步更新岗位状态时调用。
 * 和 updateJob 的区别：updateJob 改基本信息（公司名、评分等），
 * updateJobStatus 专门负责状态流转，保证时间轴正确记录。
 *
 * 【状态流转规则】（用 Map 定义合法跳转）
 * 待投递  ──→  已投递  ──→  面试中  ──→  Offer
 *   │                              │
 *   └──────────→  已拒绝  ←────────┘
 * 任何非终态都可以直接拒绝
 *
 * 【调用方式（前端）】
 * wx.cloud.callFunction({
 *   name: 'updateJobStatus',
 *   data: {
 *     jobId: '对应的_id',
 *     newStatus: '已投递',
 *     note: '官网投递完成'  // 选填，状态变更备注
 *   }
 * })
 *
 * 【入参】
 * jobId     - 必填，岗位 _id
 * newStatus - 必填，新状态：'待投递' | '已投递' | '面试中' | 'Offer' | '已拒绝'
 * note      - 选填，状态变更备注说明
 *
 * 【出参】
 * {
 *   success: true,
 *   job: { _id, status: '已投递', statusHistory: [...], nextActionDate, ... }
 * }
 */
exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID

  // ========== 第1步：参数校验 ==========
  if (!event.jobId) {
    return { success: false, errMsg: '缺少岗位 ID' }
  }
  const validStatuses = ['待投递', '已投递', '面试中', 'Offer', '已拒绝']
  if (!event.newStatus || !validStatuses.includes(event.newStatus)) {
    return { success: false, errMsg: `无效的状态值，合法值：${validStatuses.join('、')}` }
  }

  try {
    // ========== 第2步：查找岗位，确认归属 ==========
    const existResult = await db.collection('job_applications')
      .where({ _id: event.jobId, _openid: openid })
      .get()

    if (existResult.data.length === 0) {
      return { success: false, errMsg: '岗位不存在或无权修改' }
    }

    const job = existResult.data[0]
    const currentStatus = job.status

    // ========== 第3步：校验状态流转是否合法 ==========
    // 定义每种状态可以跳转到哪些状态
    const allowedTransitions = {
      '待投递': ['已投递', '已拒绝'],
      '已投递': ['面试中', '已拒绝'],
      '面试中': ['Offer', '已拒绝'],
      'Offer': [],       // Offer 是终态，不能再变更
      '已拒绝': []       // 已拒绝是终态，不能再变更
    }

    const allowed = allowedTransitions[currentStatus] || []
    if (!allowed.includes(event.newStatus)) {
      return {
        success: false,
        // 给出友好的错误提示，告诉用户当前状态可以跳到哪些状态
        errMsg: `当前状态"${currentStatus}"不能变更为"${event.newStatus}"。` +
                (allowed.length > 0
                  ? `允许的操作：${allowed.join('、')}`
                  : '当前状态为终态，不可再变更')
      }
    }

    // ========== 第4步：计算「下次建议行动日」 ==========
    // 根据新状态，自动推算用户下次应该关注这个岗位的时间
    // 天数逻辑：
    //   待投递 → 当天（立刻行动）
    //   已投递 → 3 天后（给 HR 处理时间，届时提醒跟进）
    //   面试中 → 1 天后（面试节奏快，每天关注）
    //   Offer → 无建议日（等待入职即可）
    //   已拒绝 → 无建议日（流程结束）
    const now = new Date()
    const calcNextActionDate = (status) => {
      switch (status) {
        case '待投递': return now                           // 今天
        case '已投递': return addDays(now, 3)                // 3 天后提醒跟进
        case '面试中': return addDays(now, 1)                // 1 天后
        case 'Offer':
        case '已拒绝': return null                            // 流程终止
        default: return now
      }
    }

    // ========== 第5步：更新数据库 ==========
    const serverTime = db.serverDate()
    const updateData = {
      status: event.newStatus,
      updatedAt: serverTime,
      // 追加一条状态变更记录到 statusHistory 数组
      statusHistory: db.command.push({
        status: event.newStatus,
        time: serverTime,
        note: event.note || ''   // 用户自定义备注（如"已投递官网"），没有就空字符串
      })
    }

    // 设置下次行动日
    const nextDate = calcNextActionDate(event.newStatus)
    if (nextDate) {
      updateData.nextActionDate = nextDate
    }

    // 状态变更后重置推迟次数（新阶段从零开始）
    updateData.postponeCount = 0

    await db.collection('job_applications')
      .doc(event.jobId)
      .update({ data: updateData })

    // ========== 第6步：返回更新后的完整岗位 ==========
    const updated = await db.collection('job_applications')
      .doc(event.jobId)
      .get()

    console.log(`状态推进成功: ${currentStatus} → ${event.newStatus}, ${openid}`)

    return {
      success: true,
      job: updated.data
    }

  } catch (error) {
    console.error('updateJobStatus 执行失败:', error)
    return {
      success: false,
      errMsg: error.message || '状态更新失败'
    }
  }
}

/**
 * 日期加法工具函数
 * @param {Date} date - 基准日期
 * @param {number} days - 要加的天数
 * @returns {Date} 加法后的新日期
 */
function addDays(date, days) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}
