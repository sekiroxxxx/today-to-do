/**
 * api-db.js — 直连数据库实现
 *
 * 所有函数签名与云函数保持一致，由 api.js 包装后按"直连优先 + 云函数 fallback"对外暴露。
 * 页面层不直接引用此文件。
 */

function db() { return wx.cloud.database() }
function dateStr(d) { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}` }

module.exports = {

  // ========== 用户 ==========

  updatePreference: async function (data) {
    const dailyLimit = Number(data.dailyLimit)
    if (!dailyLimit || dailyLimit < 1 || dailyLimit > 10) return { success: false, errMsg: '每日求职推荐上限需为 1~10' }
    const result = await db().collection('users').where({}).update({ data: { 'preferences.dailyLimit': dailyLimit } })
    if (result.stats.updated === 0) return { success: false, errMsg: '用户记录不存在' }
    return { success: true, dailyLimit }
  },

  // ========== 求职岗位 ==========

  addJob: async function (data) {
    if (!data.company || !data.company.trim()) return { success: false, errMsg: '公司名称不能为空' }
    if (!data.position || !data.position.trim()) return { success: false, errMsg: '岗位名称不能为空' }
    const now = db().serverDate()
    const jobData = {
      company: data.company.trim(), position: data.position.trim(),
      salaryRange: (data.salaryRange || '').trim(), applyLink: (data.applyLink || '').trim(),
      deadline: data.deadline || '',
      attractionScore: Math.min(5, Math.max(1, Number(data.attractionScore) || 3)),
      preparednessScore: Math.min(5, Math.max(1, Number(data.preparednessScore) || 1)),
      status: '待投递', statusHistory: [{ status: '待投递', time: now, note: '添加岗位' }],
      nextActionDate: now, postponeCount: 0, createdAt: now, updatedAt: now
    }
    const result = await db().collection('job_applications').add({ data: jobData })
    jobData._id = result._id
    return { success: true, job: jobData }
  },

  getJobList: async function (filter = {}) {
    const cond = {}
    const validStatuses = ['待投递', '已投递', '面试中', 'Offer', '已拒绝']
    if (filter.status && validStatuses.includes(filter.status)) cond.status = filter.status
    if (filter.keyword && filter.keyword.trim()) {
      const kw = filter.keyword.trim()
      cond.$or = [{ company: db().RegExp({ regexp: kw, options: 'i' }) }, { position: db().RegExp({ regexp: kw, options: 'i' }) }]
    }
    const result = await db().collection('job_applications').where(cond).orderBy('createdAt', 'desc').get()
    return { success: true, jobs: result.data, total: result.data.length }
  },

  updateJob: async function (data) {
    if (!data.jobId) return { success: false, errMsg: '缺少岗位 ID' }
    const updateData = {}
    ;['company', 'position', 'salaryRange', 'applyLink', 'deadline', 'attractionScore', 'preparednessScore'].forEach(f => {
      if (data[f] !== undefined) updateData[f] = typeof data[f] === 'string' ? data[f].trim() : data[f]
    })
    if (updateData.attractionScore !== undefined) { const s = Number(updateData.attractionScore); if (s < 1 || s > 5) return { success: false, errMsg: '吸引力评分必须在 1-5 之间' }; updateData.attractionScore = s }
    if (updateData.preparednessScore !== undefined) { const s = Number(updateData.preparednessScore); if (s < 1 || s > 5) return { success: false, errMsg: '准备度评分必须在 1-5 之间' }; updateData.preparednessScore = s }
    if (Object.keys(updateData).length === 0) return { success: false, errMsg: '没有需要更新的字段' }
    updateData.updatedAt = db().serverDate()
    await db().collection('job_applications').doc(data.jobId).update({ data: updateData })
    const updated = await db().collection('job_applications').doc(data.jobId).get()
    return { success: true, job: updated.data }
  },

  updateJobStatus: async function (data) {
    if (!data.jobId) return { success: false, errMsg: '缺少岗位 ID' }
    const valid = ['待投递', '已投递', '面试中', 'Offer', '已拒绝']
    if (!data.newStatus || !valid.includes(data.newStatus)) return { success: false, errMsg: `无效的状态值，合法值：${valid.join('、')}` }
    const exist = await db().collection('job_applications').doc(data.jobId).get()
    if (!exist.data) return { success: false, errMsg: '岗位不存在或无权修改' }
    const cur = exist.data.status
    const transitions = { '待投递': ['已投递', '已拒绝'], '已投递': ['面试中', '已拒绝'], '面试中': ['Offer', '已拒绝'], 'Offer': [], '已拒绝': [] }
    const allowed = transitions[cur] || []
    if (!allowed.includes(data.newStatus)) return { success: false, errMsg: `当前状态"${cur}"不能变更为"${data.newStatus}"。${allowed.length ? '允许的操作：' + allowed.join('、') : '当前状态为终态，不可再变更'}` }
    const serverTime = db().serverDate()
    const updateData = { status: data.newStatus, updatedAt: serverTime, postponeCount: 0, statusHistory: db().command.push({ status: data.newStatus, time: serverTime, note: data.note || '' }) }
    if (data.newStatus === '待投递') updateData.nextActionDate = new Date()
    else if (data.newStatus === '已投递') { const d = new Date(); d.setDate(d.getDate() + 3); updateData.nextActionDate = d }
    else if (data.newStatus === '面试中') { const d = new Date(); d.setDate(d.getDate() + 1); updateData.nextActionDate = d }
    else updateData.nextActionDate = null
    await db().collection('job_applications').doc(data.jobId).update({ data: updateData })
    const updated = await db().collection('job_applications').doc(data.jobId).get()
    return { success: true, job: updated.data }
  },

  deleteJob: async function (jobId) {
    if (!jobId) return { success: false, errMsg: '缺少岗位 ID' }
    await db().collection('daily_actions').where({ sourceId: jobId }).remove()
    await db().collection('job_applications').doc(jobId).remove()
    return { success: true }
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
      andCond.push({ $or: [{ module: filter.module.trim() }, { module: db().command.exists(false) }] })
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
    await db().collection('daily_actions').where({ sourceId: taskId }).remove()
    await db().collection('custom_tasks').doc(taskId).remove()
    return { success: true }
  },

  // ========== 今日清单 ==========

  getTodayActions: async function () {
    const todayDate = dateStr(new Date())
    const result = await db().collection('daily_actions').where({ date: todayDate }).orderBy('normalizedScore', 'desc').get()
    const actions = result.data.map(a => ({ ...a, module: a.module || (a.sourceType === 'job' ? 'jobseeker' : 'custom') }))
    return { success: true, actions, date: todayDate }
  },

  generateDailyActions: async function (forceRegenerate = false) {
    const todayDate = dateStr(new Date())
    let retainedSourceIds = []
    if (!forceRegenerate) {
      const existing = await db().collection('daily_actions').where({ date: todayDate }).orderBy('normalizedScore', 'desc').get()
      if (existing.data.length > 0) return { success: true, actions: existing.data, generated: false, diversityApplied: false, date: todayDate }
    } else {
      const todayRecords = await db().collection('daily_actions').where({ date: todayDate }).get()
      retainedSourceIds = todayRecords.data.filter(a => a.completed || a.postponed).map(a => a.sourceId)
      for (const r of todayRecords.data.filter(a => !a.completed && !a.postponed)) {
        await db().collection('daily_actions').doc(r._id).remove()
      }
    }
    const _ = db().command
    const userResult = await db().collection('users').where({}).get()
    const dailyLimit = (userResult.data[0] && userResult.data[0].preferences) ? (userResult.data[0].preferences.dailyLimit || 5) : 5
    const [jobsResult, tasksResult] = await Promise.all([
      db().collection('job_applications').where({ status: _.nin(['Offer', '已拒绝']) }).get(),
      db().collection('custom_tasks').where({ enabled: true }).get()
    ])
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const recentResult = await db().collection('daily_actions').where({ date: _.gte(dateStr(sevenDaysAgo)) }).get()
    const algorithm = require('./algorithm')
    const jobActions = algorithm.generateDailyList({
      jobs: jobsResult.data, tasks: [], recentActions: recentResult.data,
      dailyLimit, excludeSourceIds: retainedSourceIds
    }).actions.map(a => ({ ...a, module: 'jobseeker' }))
    const customActions = tasksResult.data
      .filter(t => !retainedSourceIds.includes(t._id))
      .sort((a, b) => a.priority - b.priority)
      .map(t => ({ sourceType: 'custom', sourceId: t._id, module: t.module || 'custom', title: t.title, description: t.note || '', normalizedScore: null, rawScore: null }))
    const merged = [...jobActions, ...customActions]
    const now = db().serverDate()
    await Promise.all(merged.map(a => db().collection('daily_actions').add({
      data: { date: todayDate, sourceType: a.sourceType, sourceId: a.sourceId, module: a.module, title: a.title, description: a.description, normalizedScore: a.normalizedScore, rawScore: a.rawScore, completed: false, postponed: false, completedAt: null, generatedAt: now }
    })))
    const finalResult = await db().collection('daily_actions')
      .where({ date: todayDate, completed: false, postponed: false }).orderBy('normalizedScore', 'desc').get()
    return { success: true, actions: finalResult.data, generated: true, diversityApplied: false, date: todayDate }
  },

  completeAction: async function (actionId) {
    if (!actionId) return { success: false, errMsg: '缺少 action ID' }
    const actionResult = await db().collection('daily_actions').doc(actionId).get()
    if (!actionResult.data) return { success: false, errMsg: '行动记录不存在' }
    const action = actionResult.data
    if (action.completed) return { success: false, errMsg: '该行动已经完成了' }
    const now = db().serverDate()
    await db().collection('daily_actions').doc(actionId).update({ data: { completed: true, completedAt: now } })
    const response = { success: true, sourceType: action.sourceType }
    if (action.sourceType === 'custom') {
      await db().collection('custom_tasks').doc(action.sourceId).update({ data: { lastCompletedAt: now, postponeCount: 0, updatedAt: now } })
      const tr = await db().collection('custom_tasks').doc(action.sourceId).get()
      response.taskInfo = { _id: tr.data._id, title: tr.data.title, repeatRule: tr.data.repeatRule }
    } else if (action.sourceType === 'job') {
      const jr = await db().collection('job_applications').doc(action.sourceId).get()
      response.jobInfo = { _id: jr.data._id, status: jr.data.status, company: jr.data.company, position: jr.data.position }
    }
    return response
  },

  postponeAction: async function (actionId, postponeType) {
    if (!actionId) return { success: false, errMsg: '缺少 action ID' }
    if (!postponeType || !['later', 'skip'].includes(postponeType)) return { success: false, errMsg: 'postponeType 必须为 later 或 skip' }
    const actionResult = await db().collection('daily_actions').doc(actionId).get()
    if (!actionResult.data) return { success: false, errMsg: '行动记录不存在' }
    const action = actionResult.data
    if (action.completed) return { success: false, errMsg: '已完成的行动不能推迟' }
    await db().collection('daily_actions').doc(actionId).update({ data: { postponed: true } })
    if (postponeType === 'skip') {
      const now = db().serverDate(); const inc = db().command.inc
      if (action.sourceType === 'job') {
        const jr = await db().collection('job_applications').doc(action.sourceId).get()
        if (jr.data) {
          const curNext = jr.data.nextActionDate ? new Date(jr.data.nextActionDate) : new Date(); curNext.setDate(curNext.getDate() + 1)
          await db().collection('job_applications').doc(action.sourceId).update({ data: { postponeCount: inc(1), nextActionDate: curNext, updatedAt: now } })
        }
      } else if (action.sourceType === 'custom') {
        await db().collection('custom_tasks').doc(action.sourceId).update({ data: { postponeCount: inc(1), updatedAt: now } })
      }
    }
    return { success: true, postponeType, needRegenerate: true }
  },

  // ========== 统计 ==========

  getStats: async function (range = 'week') {
    const days = range === 'month' ? 30 : 7
    const endDate = new Date(); endDate.setHours(23, 59, 59, 999)
    const startDate = new Date(); startDate.setDate(startDate.getDate() - (days - 1)); startDate.setHours(0, 0, 0, 0)
    const startStr = dateStr(startDate); const endStr = dateStr(endDate)
    const _ = db().command
    const [actionsResult, jobsResult] = await Promise.all([
      db().collection('daily_actions').where({ date: _.gte(startStr).and(_.lte(endStr)) }).get(),
      db().collection('job_applications').where({}).get()
    ])
    const actions = actionsResult.data
    const completed = actions.filter(a => a.completed).length
    const postponed = actions.filter(a => a.postponed && !a.completed).length
    const total = actions.length
    const completionRate = total > 0 ? Math.round((completed / total) * 100) / 100 : 0
    const dailyMap = {}
    for (let i = 0; i < days; i++) { const d = new Date(startDate); d.setDate(d.getDate() + i); const key = dateStr(d); dailyMap[key] = { date: key, completed: 0, postponed: 0, total: 0 } }
    actions.forEach(a => { if (dailyMap[a.date]) { dailyMap[a.date].total++; if (a.completed) dailyMap[a.date].completed++; if (a.postponed && !a.completed) dailyMap[a.date].postponed++ } })
    const funnel = { pending: 0, applied: 0, interviewing: 0, offer: 0, rejected: 0 }
    jobsResult.data.forEach(job => {
      switch (job.status) {
        case '待投递': funnel.pending++; break; case '已投递': funnel.applied++; break
        case '面试中': funnel.interviewing++; break; case 'Offer': funnel.offer++; break; case '已拒绝': funnel.rejected++; break
      }
    })
    const ja = actions.filter(a => a.sourceType === 'job'); const ca = actions.filter(a => a.sourceType === 'custom')
    return { success: true, range, startDate: startStr, endDate: endStr, summary: { total, completed, postponed, completionRate }, funnel, dailyDetail: Object.values(dailyMap), categoryBreakdown: { job: { total: ja.length, completed: ja.filter(a => a.completed).length }, custom: { total: ca.length, completed: ca.filter(a => a.completed).length } } }
  }
}
