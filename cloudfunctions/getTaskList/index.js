// 获取自定义任务列表云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENVIRONMENT })
const db = cloud.database()

/**
 * getTaskList 云函数
 *
 * 【功能说明】
 * 用户进入"任务管理"页面时调用，返回当前用户的所有任务。
 * 支持按优先级、启用状态、模块筛选，以及关键词搜索。
 *
 * 【调用方式（前端）】
 * wx.cloud.callFunction({ name: 'getTaskList', data: {} })
 *
 * // 只看高优先级
 * wx.cloud.callFunction({ name: 'getTaskList', data: { filter: { priority: 1 } } })
 *
 * // 按模块筛选（v1.1 兼容旧数据无 module 字段）
 * wx.cloud.callFunction({ name: 'getTaskList', data: { filter: { module: 'custom' } } })
 *
 * // 关键词搜索
 * wx.cloud.callFunction({ name: 'getTaskList', data: { filter: { keyword: 'LeetCode' } } })
 *
 * 【入参说明】
 * filter.priority  - 选填，1=高, 2=中, 3=低
 * filter.enabled   - 选填，true/false，筛选启用/禁用的任务
 * filter.module    - 选填，按模块筛选，兼容旧数据（无 module 字段默认视为 custom）
 * filter.keyword   - 选填，搜索关键词，匹配标题和备注
 *
 * 【出参】
 * { success: true, tasks: [...], total: 3 }
 */
exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID

  try {
    // ========== 第1步：构建查询条件 ==========
    // 用独立 conditions 数组收集，最后通过 _.and 组合
    const baseCondition = { _openid: openid }
    const andConditions = []

    // 按优先级筛选
    if (event.filter && event.filter.priority) {
      const pri = Number(event.filter.priority)
      if ([1, 2, 3].includes(pri)) {
        baseCondition.priority = pri
      }
    }

    // 按启用状态筛选
    if (event.filter && typeof event.filter.enabled === 'boolean') {
      baseCondition.enabled = event.filter.enabled
    }

    // 按模块筛选（v1.1 兼容旧数据：匹配指定模块 或 module 字段不存在）
    if (event.filter && event.filter.module && event.filter.module.trim()) {
      const mod = event.filter.module.trim()
      andConditions.push({
        $or: [
          { module: mod },
          { module: db.command.exists(false) }
        ]
      })
    }

    // 关键词搜索（标题 + 备注）
    if (event.filter && event.filter.keyword && event.filter.keyword.trim()) {
      const keyword = event.filter.keyword.trim()
      andConditions.push({
        $or: [
          { title: db.RegExp({ regexp: keyword, options: 'i' }) },
          { note: db.RegExp({ regexp: keyword, options: 'i' }) }
        ]
      })
    }

    // 组装最终查询条件
    let queryCondition
    if (andConditions.length === 0) {
      queryCondition = baseCondition
    } else if (andConditions.length === 1) {
      queryCondition = Object.assign({}, baseCondition, { $or: andConditions[0].$or })
    } else {
      queryCondition = db.command.and([baseCondition].concat(andConditions))
    }

    // ========== 第2步：查询数据库 ==========
    // 按创建时间降序，最新的在前面
    const result = await db.collection('custom_tasks')
      .where(queryCondition)
      .orderBy('createdAt', 'desc')
      .get()

    // 补齐旧数据的 module 字段（仅返回值，不写库）
    const tasks = result.data.map(function (task) {
      if (!task.module) task.module = 'custom'
      return task
    })

    console.log(`查询任务列表: ${openid}, 结果数: ${tasks.length}`)

    return {
      success: true,
      tasks: tasks,
      total: tasks.length
    }

  } catch (error) {
    console.error('getTaskList 执行失败:', error)
    return {
      success: false,
      errMsg: error.message || '获取任务列表失败'
    }
  }
}
