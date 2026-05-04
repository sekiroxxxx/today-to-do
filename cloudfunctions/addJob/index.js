// 添加求职岗位云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENVIRONMENT })
const db = cloud.database()

/**
 * addJob 云函数
 *
 * 【功能说明】
 * 用户在"求职管理"页面填写岗位信息后，点击保存，前端调用此函数。
 * 函数会校验必填字段，补充默认值，写入 job_applications 集合。
 *
 * 【调用方式（前端）】
 * wx.cloud.callFunction({
 *   name: 'addJob',
 *   data: {
 *     company: '腾讯',
 *     position: '前端开发工程师',
 *     salaryRange: '20k-35k',
 *     applyLink: 'https://zhaopin.tencent.com/xxx',
 *     deadline: '2026-06-01',
 *     attractionScore: 4,   // 吸引力 1-5，你对这个岗位有多想去的程度
 *     preparednessScore: 2  // 准备度 1-5，你的简历/面试准备程度
 *   }
 * })
 *
 * 【入参说明】
 * company          - 必填，公司名称
 * position         - 必填，岗位名称
 * salaryRange      - 选填，薪资范围，如 "20k-35k" 或 "面议"
 * applyLink        - 选填，投递链接
 * deadline         - 选填，截止日期，格式 "YYYY-MM-DD"
 * attractionScore  - 选填，吸引力评分 1-5，默认 3
 * preparednessScore- 选填，准备度评分 1-5，默认 1
 *
 * 【出参】
 * {
 *   success: true,
 *   job: { _id, company, position, status: '待投递', statusHistory: [...], ... }
 * }
 */
exports.main = async (event, context) => {
  // ========== 第1步：获取用户身份 ==========
  // 从微信上下文拿到 openid，确保数据归属到当前用户
  const openid = cloud.getWXContext().OPENID

  // ========== 第2步：校验必填字段 ==========
  // company 和 position 是必填的，不传就报错返回
  // .trim() 去掉首尾空格，防止用户只输入空格
  if (!event.company || !event.company.trim()) {
    return { success: false, errMsg: '公司名称不能为空' }
  }
  if (!event.position || !event.position.trim()) {
    return { success: false, errMsg: '岗位名称不能为空' }
  }

  // ========== 第3步：校验评分范围 ==========
  // attractionScore 和 preparednessScore 必须是 1-5 之间的整数
  const attractionScore = Number(event.attractionScore) || 3  // 默认 3 分
  const preparednessScore = Number(event.preparednessScore) || 1  // 默认 1 分

  if (attractionScore < 1 || attractionScore > 5) {
    return { success: false, errMsg: '吸引力评分必须在 1-5 之间' }
  }
  if (preparednessScore < 1 || preparednessScore > 5) {
    return { success: false, errMsg: '准备度评分必须在 1-5 之间' }
  }

  // ========== 第4步：组装要写入数据库的数据 ==========
  // status 的初始值固定为 "待投递"，不需要用户传
  // statusHistory 记录状态变更的时间轴，第一条是初始化记录
  const now = db.serverDate()  // 使用服务器时间
  const jobData = {
    // 用户身份
    _openid: openid,

    // 基本信息
    company: event.company.trim(),
    position: event.position.trim(),
    salaryRange: (event.salaryRange || '').trim(),
    applyLink: (event.applyLink || '').trim(),
    deadline: event.deadline || '',

    // 评分（算法的核心输入）
    attractionScore: attractionScore,
    preparednessScore: preparednessScore,

    // 状态字段：新岗位初始为"待投递"
    status: '待投递',
    statusHistory: [
      {
        status: '待投递',
        time: now,
        note: '添加岗位'  // 备注说明这次状态变更的原因
      }
    ],

    // nextActionDate：算法会根据这个字段计算紧迫度
    // 新岗位默认为当天，表示"今天就可以开始准备投递"
    nextActionDate: now,

    // 推迟次数：初始为 0，每次"跳过今天"会 +1
    postponeCount: 0,

    // 创建和更新时间
    createdAt: now,
    updatedAt: now
  }

  // ========== 第5步：写入数据库 ==========
  try {
    const result = await db.collection('job_applications').add({
      data: jobData
    })

    // 把自动生成的 _id 加到返回数据里，前端后续操作需要这个 ID
    jobData._id = result._id

    console.log('岗位添加成功:', openid, jobData.company, jobData.position)

    return {
      success: true,
      job: jobData
    }

  } catch (error) {
    console.error('addJob 执行失败:', error)
    return {
      success: false,
      errMsg: error.message || '添加岗位失败，请稍后重试'
    }
  }
}
