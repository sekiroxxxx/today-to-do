// 获取自定义任务列表云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENVIRONMENT })
const db = cloud.database()

/**
 * getTaskList 云函数
 *
 * 【功能说明】
 * 用户进入"任务管理"页面时调用，返回当前用户的所有任务。
 * 支持按优先级、启用状态筛选，以及关键词搜索。
 *
 * 【调用方式（前端）】
 * wx.cloud.callFunction({ name: 'getTaskList', data: {} })
 *
 * // 只看高优先级
 * wx.cloud.callFunction({ name: 'getTaskList', data: { filter: { priority: 1 } } })
 *
 * // 只看启用的
 * wx.cloud.callFunction({ name: 'getTaskList', data: { filter: { enabled: true } } })
 *
 * // 关键词搜索
 * wx.cloud.callFunction({ name: 'getTaskList', data: { filter: { keyword: 'LeetCode' } } })
 *
 * 【入参说明】
 * filter.priority  - 选填，1=高, 2=中, 3=低
 * filter.enabled   - 选填，true/false，筛选启用/禁用的任务
 * filter.keyword   - 选填，搜索关键词，匹配标题和备注
 *
 * 【出参】
 * { success: true, tasks: [...], total: 3 }
 */
exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID

  try {
    // ========== 第1步：构建查询条件 ==========
    const queryCondition = { _openid: openid }

    // 按优先级筛选
    if (event.filter && event.filter.priority) {
      const pri = Number(event.filter.priority)
      if ([1, 2, 3].includes(pri)) {
        queryCondition.priority = pri
      }
    }

    // 按启用状态筛选
    if (event.filter && typeof event.filter.enabled === 'boolean') {
      queryCondition.enabled = event.filter.enabled
    }

    // 按模块筛选（v1.1）
    if (event.filter && event.filter.module && event.filter.module.trim()) {
      queryCondition.module = event.filter.module.trim()
    }

    // 关键词搜索（标题 + 备注）
    if (event.filter && event.filter.keyword && event.filter.keyword.trim()) {
      const keyword = event.filter.keyword.trim()
      queryCondition.$or = [
        { title: db.RegExp({ regexp: keyword, options: 'i' }) },
        { note: db.RegExp({ regexp: keyword, options: 'i' }) }
      ]
    }

    // ========== 第2步：查询数据库 ==========
    // 按创建时间降序，最新的在前面
    const result = await db.collection('custom_tasks')
      .where(queryCondition)
      .orderBy('createdAt', 'desc')
      .get()

    console.log(`查询任务列表: ${openid}, 结果数: ${result.data.length}`)

    return {
      success: true,
      tasks: result.data,
      total: result.data.length
    }

  } catch (error) {
    console.error('getTaskList 执行失败:', error)
    return {
      success: false,
      errMsg: error.message || '获取任务列表失败'
    }
  }
}
