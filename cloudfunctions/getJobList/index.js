// 获取求职岗位列表云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENVIRONMENT })
const db = cloud.database()
const _ = db.command  // 数据库操作符，用于构建复杂查询条件

/**
 * getJobList 云函数
 *
 * 【功能说明】
 * 用户进入"求职管理"页面时调用，返回当前用户的所有岗位。
 * 支持按状态筛选（只看"待投递"等）和按公司名/岗位名搜索。
 *
 * 【调用方式（前端）】
 * // 获取全部岗位
 * wx.cloud.callFunction({ name: 'getJobList', data: {} })
 *
 * // 按状态筛选
 * wx.cloud.callFunction({ name: 'getJobList', data: { filter: { status: '面试中' } } })
 *
 * // 关键词搜索
 * wx.cloud.callFunction({ name: 'getJobList', data: { filter: { keyword: '前端' } } })
 *
 * 【入参说明】
 * filter.status   - 选填，岗位状态：'待投递' | '已投递' | '面试中' | 'Offer' | '已拒绝'
 * filter.keyword  - 选填，搜索关键词，会同时匹配公司名和岗位名
 *
 * 【出参】
 * {
 *   success: true,
 *   jobs: [ { _id, company, position, status, attractionScore, ... }, ... ],
 *   total: 3
 * }
 */
exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID

  try {
    // ========== 第1步：构建查询条件 ==========
    // 基础条件：只查当前用户的数据
    const queryCondition = { _openid: openid }

    // 条件A：按状态筛选
    // 如果前端传了 status 且不是空字符串，就加上状态过滤
    const validStatuses = ['待投递', '已投递', '面试中', 'Offer', '已拒绝']
    if (event.filter && event.filter.status && validStatuses.includes(event.filter.status)) {
      queryCondition.status = event.filter.status
    }

    // 条件B：关键词搜索
    // 用 $or 连接，同时在公司名和岗位名中模糊匹配
    // db.RegExp 是微信云数据库的正则查询，用于模糊搜索
    if (event.filter && event.filter.keyword && event.filter.keyword.trim()) {
      const keyword = event.filter.keyword.trim()
      queryCondition.$or = [
        // i: 忽略大小写，g: 全局匹配
        { company: db.RegExp({ regexp: keyword, options: 'i' }) },
        { position: db.RegExp({ regexp: keyword, options: 'i' }) }
      ]
    }

    // ========== 第2步：查询数据库 ==========
    // .orderBy() 按创建时间降序排列，最新添加的岗位显示在最前面
    const result = await db.collection('job_applications')
      .where(queryCondition)
      .orderBy('createdAt', 'desc')
      .get()

    console.log(`查询岗位列表: ${openid}, 结果数: ${result.data.length}`)

    return {
      success: true,
      jobs: result.data,
      total: result.data.length
    }

  } catch (error) {
    console.error('getJobList 执行失败:', error)
    return {
      success: false,
      errMsg: error.message || '获取岗位列表失败'
    }
  }
}
