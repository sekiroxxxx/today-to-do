/**
 * api-db.js — 直连数据库实现（精简版）
 *
 * 方案二后：仅保留 custom_tasks 和 users 的直连操作。
 * 追踪项操作已迁移到 tracked.js，今日清单方法已迁移到 api.js（本地算法）。
 */

function db() { return wx.cloud.database() }

module.exports = {

  // ========== 用户 ==========

  /**
   * 更新偏好 → 写入 users.modulePrefs[module]
   * data: { module: 'jobseeker', dailyLimit: 5 }
   * 兼容旧调用：data: { dailyLimit: 5 } → 自动映射到 jobseeker 模块
   */
  updatePreference: async function (data) {
    const mod = data.module || 'jobseeker'
    const dailyLimit = Number(data.dailyLimit)
    const modCfg = require('./phrases').getModuleConfig(mod)
    const [min, max] = modCfg.limitRange
    if (!dailyLimit || dailyLimit < min || dailyLimit > max) return { success: false, errMsg: `${modCfg.limitLabel}需为 ${min}~${max}` }
    const result = await db().collection('users').where({}).update({
      data: { ['modulePrefs.' + mod + '.dailyLimit']: dailyLimit }
    })
    if (result.stats.updated === 0) return { success: false, errMsg: '用户记录不存在' }
    return { success: true, dailyLimit, module: mod }
  },

  // ========== 自定义任务 ==========

  addTask: async function (data) {
    if (!data.title || !data.title.trim()) return { success: false, errMsg: '任务标题不能为空' }
    const priority = Number(data.priority) || 2
    if (![1, 2, 3].includes(priority)) return { success: false, errMsg: '优先级只能为 1(高)、2(中)、3(低)' }
    const estMin = Number(data.estimatedMinutes) || 0
    if (estMin < 0) return { success: false, errMsg: '预计耗时不能为负数' }
    let repeatRule = { type: 'none', daysOfWeek: [] }
    if (data.repeatRule && data.repeatRule.type) {
      const validTypes = ['none', 'daily', 'weekly']
      if (!validTypes.includes(data.repeatRule.type)) return { success: false, errMsg: `重复类型只能为：${validTypes.join('、')}` }
      repeatRule.type = data.repeatRule.type
      if (data.repeatRule.type === 'weekly') {
        const days = data.repeatRule.daysOfWeek || []
        if (!Array.isArray(days) || days.length === 0) return { success: false, errMsg: '每周重复任务必须选择至少一个星期几' }
        if (!days.every(d => Number.isInteger(d) && d >= 1 && d <= 7)) return { success: false, errMsg: 'daysOfWeek 必须是 1-7 的整数' }
        repeatRule.daysOfWeek = days.sort((a, b) => a - b)
      }
    }
    const now = db().serverDate()
    const taskData = { title: data.title.trim(), note: (data.note || '').trim(), priority, module: data.module || 'custom', estimatedMinutes: estMin, deadline: data.deadline || '', repeatRule, enabled: true, postponeCount: 0, lastCompletedAt: null, createdAt: now, updatedAt: now }
    const result = await db().collection('custom_tasks').add({ data: taskData })
    taskData._id = result._id
    return { success: true, task: taskData }
  },

  getTaskList: async function (filter = {}) {
    const cond = {}
    if (filter.priority) { const p = Number(filter.priority); if ([1, 2, 3].includes(p)) cond.priority = p }
    if (typeof filter.enabled === 'boolean') cond.enabled = filter.enabled
    const andCond = []
    if (filter.module && filter.module.trim()) {
      const mod = filter.module.trim()
      // custom 模块兼容旧数据（无 module 字段的视为 custom）
      if (mod === 'custom') {
        andCond.push({ $or: [{ module: 'custom' }, { module: db().command.exists(false) }] })
      } else {
        cond.module = mod
      }
    }
    if (filter.keyword && filter.keyword.trim()) {
      const kw = filter.keyword.trim()
      andCond.push({ $or: [{ title: db().RegExp({ regexp: kw, options: 'i' }) }, { note: db().RegExp({ regexp: kw, options: 'i' }) }] })
    }
    let finalCond = cond
    if (andCond.length === 1) finalCond = Object.assign({}, cond, { $or: andCond[0].$or })
    else if (andCond.length > 1) finalCond = db().command.and([cond].concat(andCond))
    const result = await db().collection('custom_tasks').where(finalCond).orderBy('createdAt', 'desc').get()
    const tasks = result.data.map(t => { if (!t.module) t.module = 'custom'; return t })
    return { success: true, tasks, total: tasks.length }
  },

  updateTask: async function (data) {
    if (!data.taskId) return { success: false, errMsg: '缺少任务 ID' }
    const updateData = {}
    ;['title', 'note', 'priority', 'estimatedMinutes', 'deadline', 'repeatRule', 'enabled'].forEach(f => {
      if (data[f] !== undefined) updateData[f] = typeof data[f] === 'string' ? data[f].trim() : data[f]
    })
    if (updateData.priority !== undefined && ![1, 2, 3].includes(updateData.priority)) return { success: false, errMsg: '优先级只能为 1(高)、2(中)、3(低)' }
    if (updateData.estimatedMinutes !== undefined && updateData.estimatedMinutes < 0) return { success: false, errMsg: '预计耗时不能为负数' }
    if (updateData.repeatRule) {
      const rr = updateData.repeatRule
      if (!['none', 'daily', 'weekly'].includes(rr.type)) return { success: false, errMsg: '重复类型无效' }
      if (rr.type === 'weekly') {
        if (!Array.isArray(rr.daysOfWeek) || rr.daysOfWeek.length === 0) return { success: false, errMsg: '每周重复任务必须选择至少一个星期几' }
        if (!rr.daysOfWeek.every(d => d >= 1 && d <= 7)) return { success: false, errMsg: 'daysOfWeek 必须是 1-7 的整数' }
        rr.daysOfWeek = rr.daysOfWeek.sort((a, b) => a - b)
      }
    }
    if (Object.keys(updateData).length === 0) return { success: false, errMsg: '没有需要更新的字段' }
    updateData.updatedAt = db().serverDate()
    await db().collection('custom_tasks').doc(data.taskId).update({ data: updateData })
    const updated = await db().collection('custom_tasks').doc(data.taskId).get()
    return { success: true, task: updated.data }
  },

  deleteTask: async function (taskId) {
    if (!taskId) return { success: false, errMsg: '缺少任务 ID' }
    await db().collection('completed_log').where({sourceId: taskId}).remove()
    await db().collection('custom_tasks').doc(taskId).remove()
    return { success: true }
  }
}
