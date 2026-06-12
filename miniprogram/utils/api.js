/**
 * API 封装层 — 直连数据库优先 + 云函数 fallback
 *
 * 方案二：数据模型重构
 * - tracked_items 替代 job_applications
 * - completed_log + 本地算法替代 daily_actions
 * - 旧方法 (addJob/getJobList/...) 保留签名，内部桥接到新方法
 */

const apiDb = require('./api-db')
const tracked = require('./tracked')
const algorithm = require('./algorithm')
const phrases = require('./phrases')

// ==================== 内部工具 ====================

function call(name, data = {}) {
  return wx.cloud.callFunction({ name, data })
    .then(res => {
      if (res.result && res.result.success === false) return res.result
      return res.result
    })
    .catch(err => {
      wx.showToast({ title: '网络异常，请稍后重试', icon: 'none', duration: 2000 })
      console.error(`[api] ${name} 调用失败:`, err)
      return { success: false, errMsg: '网络异常' }
    })
}

function tryDirect(cloudName, cloudParams, directFn, directArgs) {
  try {
    return directFn(directArgs).catch(err => {
      console.warn(`[api] 直连失败，回退云函数 ${cloudName}:`, err)
      return call(cloudName, cloudParams)
    })
  } catch (err) {
    return call(cloudName, cloudParams)
  }
}

function dateStr(d) { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}` }

// ==================== 对外 API ====================

module.exports = {

  /** 登录 → { user }  仅走云函数（微信登录必需） */
  login() { return call('login') },

  // ========== 追踪项（tracked_items，新模型） ==========

  addTrackedItem(data) { return tryDirect('addJob', data, tracked.addTrackedItem, data) },
  getTrackedItems(filter) { return tryDirect('getJobList', { filter }, tracked.getTrackedItems, filter || {}) },
  updateTrackedItem(data) { return tryDirect('updateJob', data, tracked.updateTrackedItem, data) },
  updateTrackedItemStatus(data) { return tryDirect('updateJobStatus', data, tracked.updateTrackedItemStatus, data) },
  deleteTrackedItem(itemId) { return tryDirect('deleteJob', { jobId: itemId }, tracked.deleteTrackedItem, itemId) },
  logComplete(data) { return tryDirect('completeAction', data, tracked.logComplete, data) },

  // ========== 求职岗位（桥接到 tracked_items，签名不变） ==========

  addJob(data) {
    return this.addTrackedItem({
      module: 'jobseeker',
      title: `${(data.company || '').trim()} - ${(data.position || '').trim()}`,
      fields: {
        company: (data.company || '').trim(), position: (data.position || '').trim(),
        salaryRange: (data.salaryRange || '').trim(), applyLink: (data.applyLink || '').trim(),
        deadline: data.deadline || '',
        scores: {
          attraction: Math.min(5, Math.max(1, Number(data.attractionScore) || 3)),
          preparedness: Math.min(5, Math.max(1, Number(data.preparednessScore) || 1))
        }
      }
    }).then(res => res.success && res.item ? { success: true, job: itemToJob(res.item) } : res)
  },

  getJobList(filter = {}) {
    return this.getTrackedItems({ ...filter, module: 'jobseeker' }).then(res =>
      res.success ? { success: true, jobs: (res.items || []).map(itemToJob), total: res.total } : res
    )
  },

  updateJob(data) {
    const fields = {}
    ;['company', 'position', 'salaryRange', 'applyLink', 'deadline'].forEach(k => {
      if (data[k] !== undefined) fields[k] = typeof data[k] === 'string' ? data[k].trim() : data[k]
    })
    if (data.attractionScore !== undefined || data.preparednessScore !== undefined) {
      fields.scores = {}
      if (data.attractionScore !== undefined) fields.scores.attraction = Number(data.attractionScore)
      if (data.preparednessScore !== undefined) fields.scores.preparedness = Number(data.preparednessScore)
    }
    // 校验评分 (与云函数保持一致)
    if (fields.scores) {
      if (fields.scores.attraction !== undefined) {
        const s = fields.scores.attraction; if (s < 1 || s > 5) return Promise.resolve({ success: false, errMsg: '吸引力评分必须在 1-5 之间' })
      }
      if (fields.scores.preparedness !== undefined) {
        const s = fields.scores.preparedness; if (s < 1 || s > 5) return Promise.resolve({ success: false, errMsg: '准备度评分必须在 1-5 之间' })
      }
    }
    return this.updateTrackedItem({ itemId: data.jobId, fields }).then(res =>
      res.success && res.item ? { success: true, job: itemToJob(res.item) } : res
    )
  },

  updateJobStatus(data) {
    return this.updateTrackedItemStatus({ itemId: data.jobId, newStatus: data.newStatus, note: data.note }).then(res =>
      res.success && res.item ? { success: true, job: itemToJob(res.item) } : res
    )
  },

  deleteJob(jobId) { return this.deleteTrackedItem(jobId) },

  // ========== 自定义任务（不变） ==========

  addTask(data) { return tryDirect('addTask', data, apiDb.addTask, data) },
  getTaskList(filter) { return tryDirect('getTaskList', { filter }, apiDb.getTaskList, filter || {}) },
  updateTask(data) { return tryDirect('updateTask', data, apiDb.updateTask, data) },
  deleteTask(taskId) { return tryDirect('deleteTask', { taskId }, apiDb.deleteTask, taskId) },

  // ========== 用户 ==========

  updatePreference(data) { return tryDirect('updatePreference', data, apiDb.updatePreference, data) },

  // ========== 今日清单（本地算法 + completed_log） ==========

  /** 查询/生成今日清单 → 本地算法计算 */
  getTodayActions() { return this._runLocalAlgorithm() },
  generateDailyActions(forceRegenerate) { return this._runLocalAlgorithm(forceRegenerate) },

  /** 完成一条行动 */
  completeAction(actionId) {
    return (async () => {
      if (!actionId) return { success: false, errMsg: '缺少 action ID' }
      // 本地算法生成的 action（_id 格式: local_tracked_xxx 或 local_custom_xxx）
      if (actionId.startsWith('local_')) {
        const rest = actionId.replace('local_', '')
        let sourceType, sourceId
        if (rest.startsWith('tracked_')) { sourceType = 'tracked'; sourceId = rest.replace('tracked_', '') }
        else if (rest.startsWith('custom_')) { sourceType = 'custom'; sourceId = rest.replace('custom_', '') }
        else { sourceType = 'job'; sourceId = rest.replace('job_', '') }
        // 写 completed_log
        const logRes = await tracked.logComplete({ date: dateStr(new Date()), sourceType, sourceId, title: '', module: sourceType === 'tracked' ? 'jobseeker' : 'custom' })
        if (!logRes.success) return logRes
        // 更新源记录
        const response = { success: true, sourceType }
        if (sourceType === 'custom') {
          try {
            const taskRes = await wx.cloud.database().collection('custom_tasks').doc(sourceId).get()
            if (taskRes.data) response.taskInfo = { _id: taskRes.data._id, title: taskRes.data.title, repeatRule: taskRes.data.repeatRule }
          } catch (_) { }
        } else {
          try {
            const itemRes = await wx.cloud.database().collection('tracked_items').doc(sourceId).get()
            if (itemRes.data) {
              const f = itemRes.data.fields || {}
              response.jobInfo = { _id: itemRes.data._id, status: itemRes.data.status, company: f.company || '', position: f.position || '' }
            }
          } catch (_) { }
        }
        return response
      }
      // 旧 daily_actions _id → 回退云函数
      return call('completeAction', { actionId })
    })()
  },

  /** 推迟一条行动 → 回退云函数（涉及多表更新） */
  postponeAction(actionId, postponeType) {
    if (!postponeType || !['later', 'skip'].includes(postponeType)) return Promise.resolve({ success: false, errMsg: 'postponeType 必须为 later 或 skip' })
    // 本地 action：仅更新 tracked_items / custom_tasks 的 postponeCount
    if (actionId.startsWith('local_')) {
      const rest = actionId.replace('local_', '')
      let sourceType, sourceId
      if (rest.startsWith('tracked_')) { sourceType = 'tracked'; sourceId = rest.replace('tracked_', '') }
      else if (rest.startsWith('custom_')) { sourceType = 'custom'; sourceId = rest.replace('custom_', '') }
      else { sourceType = 'job'; sourceId = rest.replace('job_', '') }
      if (postponeType === 'skip' && sourceId) {
        const db = wx.cloud.database()
        const now = new Date()
        if (sourceType === 'tracked' || sourceType === 'job') {
          return db.collection('tracked_items').doc(sourceId).get().then(r => {
            if (r.data) {
              const curNext = r.data.nextActionDate ? new Date(r.data.nextActionDate) : new Date()
              curNext.setDate(curNext.getDate() + 1)
              return db.collection('tracked_items').doc(sourceId).update({
                data: { postponeCount: db.command.inc(1), nextActionDate: curNext, updatedAt: now }
              })
            }
          }).then(() => ({ success: true, postponeType, needRegenerate: true }))
            .catch(err => { console.warn('[api] 直连 postpone 失败:', err); return call('postponeAction', { actionId, postponeType }) })
        } else {
          return db.collection('custom_tasks').doc(sourceId).update({
            data: { postponeCount: db.command.inc(1), updatedAt: now }
          }).then(() => ({ success: true, postponeType, needRegenerate: true }))
            .catch(err => { console.warn('[api] 直连 postpone 失败:', err); return call('postponeAction', { actionId, postponeType }) })
        }
      }
      return { success: true, postponeType, needRegenerate: true }
    }
    // 旧 daily_actions → 云函数
    return call('postponeAction', { actionId, postponeType })
  },

  // ========== 统计（completed_log + tracked_items） ==========

  getStats(range) {
    return tracked.getStatsFromLogs(range || 'week').catch(err => {
      console.warn('[api] 直连统计失败，回退云函数 getStats:', err)
      return call('getStats', { range: range || 'week' })
    })
  },

  // ========== 内部：本地算法生成今日清单 ==========

  _runLocalAlgorithm: async function (forceRegenerate) {
    const todayDate = dateStr(new Date())
    try {
      const todayLogs = await tracked.getCompletedLogs(todayDate, todayDate)
      const completedSourceIds = (todayLogs.logs || []).map(l => l.sourceId)
      const [trackedItems, tasksRes] = await Promise.all([
        tracked.getActiveTrackedItems(),
        apiDb.getTaskList()
      ])
      const tasks = tasksRes.success ? tasksRes.tasks : []
      const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      const recentLogs = await tracked.getCompletedLogs(dateStr(sevenDaysAgo), todayDate)
      const recentActions = (recentLogs.logs || []).map(l => ({ date: l.date, sourceType: l.sourceType }))
      // 从用户 modulePrefs 读取各模块的 dailyLimit
      let dailyLimit = 5
      try {
        const userResult = await wx.cloud.database().collection('users').where({}).get()
        if (userResult.data && userResult.data[0]) {
          const user = userResult.data[0]
          // 对 jobseeker 模块取对应的 limit（后续算法支持多模块时改为按 module 取）
          const cfg = phrases.getModuleConfig('jobseeker', user)
          dailyLimit = cfg.dailyLimit
        }
      } catch (_) { }
      const result = algorithm.generateDailyList({
        jobs: trackedItems.map(ti => ({
          _id: ti._id, company: (ti.fields || {}).company || '', position: (ti.fields || {}).position || '',
          status: ti.status,
          attractionScore: ((ti.fields || {}).scores || {}).attraction || 1,
          preparednessScore: ((ti.fields || {}).scores || {}).preparedness || 1,
          nextActionDate: ti.nextActionDate, postponeCount: ti.postponeCount || 0, createdAt: ti.createdAt
        })),
        tasks, recentActions, dailyLimit, excludeSourceIds: completedSourceIds
      })
      const actions = result.actions.map(a => ({
        ...a,
        _id: `local_${a.sourceType}_${a.sourceId}`,
        module: a.module || (a.sourceType === 'job' ? 'jobseeker' : 'custom'),
        completed: false, postponed: false, date: todayDate
      }))
      return { success: true, actions, date: todayDate, generated: true, diversityApplied: result.diversityApplied }
    } catch (err) {
      console.warn('[api] 本地算法失败，回退云函数:', err)
      return call('generateDailyActions', { forceRegenerate })
    }
  }
}

// ==================== 桥接工具 ====================

/** tracked_items → 旧 job 格式 */
function itemToJob(item) {
  const f = item.fields || {}; const scores = f.scores || {}
  return {
    _id: item._id, company: f.company || '', position: f.position || '',
    salaryRange: f.salaryRange || '', applyLink: f.applyLink || '', deadline: f.deadline || '',
    attractionScore: scores.attraction || 3, preparednessScore: scores.preparedness || 1,
    status: item.status, statusHistory: item.statusHistory || [],
    nextActionDate: item.nextActionDate, postponeCount: item.postponeCount || 0,
    createdAt: item.createdAt, updatedAt: item.updatedAt
  }
}
