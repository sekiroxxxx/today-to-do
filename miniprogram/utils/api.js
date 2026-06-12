/**
 * API 封装层 — 直连数据库优先 + 云函数 fallback
 *
 * 阶段 A：所有 CRUD 方法先走 wx.cloud.database() 直连，
 * 失败时回退到云函数。API 签名不变，页面层无需任何改动。
 *
 * login 仅走云函数（微信登录必需）。
 */

const apiDb = require('./api-db')

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

/**
 * 包装直接函数：优先走直连，失败时回退云函数。
 * @param {string} cloudName 云函数名称
 * @param {*} cloudParams 传给云函数的参数
 * @param {Function} directFn 直接数据库实现的函数（签名为 async (params) => result）
 * @param {*} directArgs 传给 directFn 的参数
 */
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

// ==================== 对外 API ====================

module.exports = {

  /** 登录 → { user }  仅走云函数（微信登录必需） */
  login() {
    return call('login')
  },

  /** 更新偏好 → { success } */
  updatePreference(data) {
    return tryDirect('updatePreference', data, apiDb.updatePreference, data)
  },

  /** 添加岗位 → { success, job } */
  addJob(data) {
    return tryDirect('addJob', data, apiDb.addJob, data)
  },

  /** 获取岗位列表 → { jobs, total } */
  getJobList(filter = {}) {
    return tryDirect('getJobList', { filter }, apiDb.getJobList, filter)
  },

  /** 更新岗位基本信息 → { success, job } */
  updateJob(data) {
    return tryDirect('updateJob', data, apiDb.updateJob, data)
  },

  /** 推进岗位状态 → { success, job } */
  updateJobStatus(data) {
    return tryDirect('updateJobStatus', data, apiDb.updateJobStatus, data)
  },

  /** 删除岗位 → { success } */
  deleteJob(jobId) {
    return tryDirect('deleteJob', { jobId }, apiDb.deleteJob, jobId)
  },

  /** 添加任务 → { success, task } */
  addTask(data) {
    return tryDirect('addTask', data, apiDb.addTask, data)
  },

  /** 获取任务列表 → { tasks, total } */
  getTaskList(filter = {}) {
    return tryDirect('getTaskList', { filter }, apiDb.getTaskList, filter)
  },

  /** 更新任务 → { success, task } */
  updateTask(data) {
    return tryDirect('updateTask', data, apiDb.updateTask, data)
  },

  /** 删除任务 → { success } */
  deleteTask(taskId) {
    return tryDirect('deleteTask', { taskId }, apiDb.deleteTask, taskId)
  },

  /** 查询今日已生成的清单 → { actions, date } */
  getTodayActions() {
    return tryDirect('getTodayActions', {}, apiDb.getTodayActions)
  },

  /** 生成/刷新今日清单 → { actions, generated, diversityApplied, date } */
  generateDailyActions(forceRegenerate = false) {
    return tryDirect('generateDailyActions', { forceRegenerate }, apiDb.generateDailyActions, forceRegenerate)
  },

  /** 完成一条行动 → { success, sourceType, jobInfo?, taskInfo? } */
  completeAction(actionId) {
    return tryDirect('completeAction', { actionId }, apiDb.completeAction, actionId)
  },

  /** 推迟一条行动 → { success, postponeType, needRegenerate } */
  postponeAction(actionId, postponeType) {
    return tryDirect('postponeAction', { actionId, postponeType }, apiDb.postponeAction, actionId, postponeType)
  },

  /** 获取统计数据 → { summary, funnel, dailyDetail, categoryBreakdown, ... } */
  getStats(range = 'week') {
    return tryDirect('getStats', { range }, apiDb.getStats, range)
  }
}
