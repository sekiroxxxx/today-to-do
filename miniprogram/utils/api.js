/**
 * API 封装层 — 将所有云函数调用统一封装
 *
 * 【为什么需要这一层】
 * 1. 页面代码不用反复写 wx.cloud.callFunction({ name: 'xxx', data: {} })
 * 2. 统一错误处理：网络异常时全局 toast 提示
 * 3. 如果将来换后端（比如从云函数换到自己写的服务器），只改这一个文件
 *
 * 【使用方式】
 * const api = require('../../utils/api')
 * api.login().then(res => console.log(res.user))
 * api.getJobList({ filter: { status: '待投递' } }).then(res => console.log(res.jobs))
 */

// ---------- 内部：统一调用方法 ----------

function call(name, data = {}) {
  return wx.cloud.callFunction({ name, data })
    .then(res => {
      if (res.result && res.result.success === false) {
        // 业务层错误（如参数校验失败），不弹 toast，让调用方自己处理
        return res.result
      }
      return res.result
    })
    .catch(err => {
      // 网络层错误（断网、云函数崩溃等）
      wx.showToast({ title: '网络异常，请稍后重试', icon: 'none', duration: 2000 })
      console.error(`[api] ${name} 调用失败:`, err)
      return { success: false, errMsg: '网络异常' }
    })
}

// ---------- 对外导出的 API ----------

module.exports = {

  // ==================== 用户 ====================

  /** 登录 → { user } */
  login() {
    return call('login')
  },

  // ==================== 求职岗位 ====================

  /** 添加岗位 → { success, job } */
  addJob(data) {
    return call('addJob', data)
  },

  /** 获取岗位列表 → { jobs, total } */
  getJobList(filter = {}) {
    return call('getJobList', { filter })
  },

  /** 更新岗位基本信息 → { success, job } */
  updateJob(data) {
    return call('updateJob', data)
  },

  /** 推进岗位状态 → { success, job } */
  updateJobStatus(data) {
    return call('updateJobStatus', data)
  },

  /** 删除岗位 → { success } */
  deleteJob(jobId) {
    return call('deleteJob', { jobId })
  },

  // ==================== 自定义任务 ====================

  /** 添加任务 → { success, task } */
  addTask(data) {
    return call('addTask', data)
  },

  /** 获取任务列表 → { tasks, total } */
  getTaskList(filter = {}) {
    return call('getTaskList', { filter })
  },

  /** 更新任务 → { success, task } */
  updateTask(data) {
    return call('updateTask', data)
  },

  /** 删除任务 → { success } */
  deleteTask(taskId) {
    return call('deleteTask', { taskId })
  },

  // ==================== 今日清单 ====================

  /** 查询今日已生成的清单 → { actions, date } */
  getTodayActions() {
    return call('getTodayActions')
  },

  /** 生成/刷新今日清单 → { actions, generated, diversityApplied } */
  generateDailyActions(forceRegenerate = false) {
    return call('generateDailyActions', { forceRegenerate })
  },

  /** 完成一条行动 → { success, sourceType, jobInfo?, taskInfo? } */
  completeAction(actionId) {
    return call('completeAction', { actionId })
  },

  /** 推迟一条行动 → { success, postponeType, needRegenerate } */
  postponeAction(actionId, postponeType) {
    return call('postponeAction', { actionId, postponeType })
  },

  // ==================== 统计 ====================

  /** 获取统计数据 → { summary, funnel, dailyDetail, ... } */
  getStats(range = 'week') {
    return call('getStats', { range })
  }
}
