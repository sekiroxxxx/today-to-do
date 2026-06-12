/**
 * cache.js — 本地优先缓存层
 *
 * 【设计原则】
 * - 读：优先 Storage 缓存，无缓存或 forceRefresh 时走 api.js，结果写回缓存
 * - 写：先更新本地缓存 → 立即返回 → 后台调 api.js → 失败时标记 _dirty
 * - 脏标记：与 app.globalData.dirty 联动，控制 Tab 页面刷新
 *
 * 【使用方式】
 * 页面代码从 api.xxx() 改为 cache.xxx()，接口签名相同。
 * 缓存键规则：cache_jobs / cache_tasks / cache_today / cache_user / cache_stats_{range}
 */
const api = require('./api')
function app() { return getApp() }
// ==================== 内部工具 ====================
/** 存储键前缀 */
const PREFIX = 'cache_'

/** 缓存过期时间（秒），0=永不过期 */
const TTL = {
  tracked: 300, tasks: 300, today: 120,
  user: 0, stats_week: 600, stats_month: 600
}

/** 读缓存 */
function read(key) {
  try {
    const raw = wx.getStorageSync(PREFIX + key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (_) { return null }
}

/** 写缓存（含时间戳） */
function write(key, data) {
  try {
    wx.setStorageSync(PREFIX + key, JSON.stringify({ data, ts: Date.now() }))
  } catch (_) { /* Storage 满了，静默失败 */ }
}

/** 删缓存 */
function remove(key) {
  try { wx.removeStorageSync(PREFIX + key) } catch (_) { }
}

function isStale(key) {
  const ttl = TTL[key] || 0
  if (ttl === 0) return false
  const cache = read(key)
  if (!cache) return true
  return (Date.now() - cache.ts) > ttl * 1000
}

/** 清除脏标记 */
function clearDirty(tab) {
  const a = app()
  if (a && a.globalData && a.globalData.dirty) {
    a.globalData.dirty[tab] = false
  }
}

// ==================== 读取（缓存优先） ====================

module.exports = {
  /** 获取追踪项列表（新模型） */
  getTrackedItems: async function (filter = {}, forceRefresh = false) {
    const key = 'tracked'
    if (!forceRefresh && !isStale(key)) {
      const cache = read(key)
      if (cache) { clearDirty('jobs'); return cache.data }
    }
    const res = await api.getTrackedItems(filter)
    if (res.success) { write(key, res.items); clearDirty('jobs'); return res.items }
    const stale = read(key)
    return stale ? stale.data : []
  },

  /** 获取岗位列表（兼容旧接口，桥接到 getTrackedItems） */
  getJobs: async function (forceRefresh) {
    return this.getTrackedItems({ module: 'jobseeker' }, forceRefresh)
  },

  /** 获取任务列表 */
  getTasks: async function (forceRefresh = false) {
    const key = 'tasks'
    if (!forceRefresh && !isStale(key)) {
      const cache = read(key)
      if (cache) { clearDirty('tasks'); return cache.data }
    }
    const res = await api.getTaskList()
    if (res.success) { write(key, res.tasks); clearDirty('tasks'); return res.tasks }
    const stale = read(key)
    return stale ? stale.data : []
  },

  /** 获取今日清单 */
  getToday: async function (forceRefresh = false) {
    const key = 'today'
    if (!forceRefresh && !isStale(key)) {
      const cache = read(key)
      if (cache) { clearDirty('today'); return cache.data }
    }
    // 先从 getTodayActions 拿，没有则 generate
    let res = await api.getTodayActions()
    if (!res.success || !res.actions.length) {
      res = await api.generateDailyActions()
    }
    if (res.success) { write(key, res.actions); clearDirty('today'); return res.actions }
    const stale = read(key)
    return stale ? stale.data : []
  },

  /** 获取用户信息 */
  getUser: async function () {
    const key = 'user'
    if (!isStale(key)) {
      const cache = read(key)
      if (cache) return cache.data
    }
    // 优先用 app.globalData.userInfo
    const userInfo = await app().getUserInfo()
    if (userInfo) { write(key, userInfo) }
    return userInfo
  },

  /** 获取统计 */
  getStats: async function (range = 'week', forceRefresh = false) {
    const key = 'stats_' + range
    if (!forceRefresh && !isStale(key)) {
      const cache = read(key)
      if (cache) { clearDirty('mine'); return cache.data }
    }
    const res = await api.getStats(range)
    if (res.success) { write(key, res); clearDirty('mine'); return res }
    const stale = read(key)
    return stale ? stale.data : res
  },
  // ==================== 写入（先更新本地 → 后调 API） ====================

  /** 添加岗位 */
  addJob: async function (data) {
    // 乐观更新：先加到本地
    const cache = read('jobs')
    const localList = (cache ? cache.data : []) || []
    const tempId = '_local_' + Date.now()
    const now = new Date()
    const localJob = {
      _id: tempId, company: data.company.trim(), position: data.position.trim(),
      salaryRange: (data.salaryRange || '').trim(), applyLink: (data.applyLink || '').trim(),
      deadline: data.deadline || '', attractionScore: Number(data.attractionScore) || 3,
      preparednessScore: Number(data.preparednessScore) || 1, status: '待投递',
      statusHistory: [{ status: '待投递', time: now, note: '添加岗位' }],
      nextActionDate: now, postponeCount: 0, createdAt: now, updatedAt: now
    }
    write('jobs', [localJob, ...localList])
    remove('stats_week'); remove('stats_month')  // 统计缓存已过期
    app().markDirty(['jobs', 'progress', 'mine'])

    // 后台同步
    const res = await api.addJob(data)
    if (res.success && res.job) {
      // 用服务器返回的正式记录替换本地临时记录
      const fresh = read('jobs')
      if (fresh && fresh.data) {
        const updated = fresh.data.map(j => j._id === tempId ? res.job : j)
        write('jobs', updated)
      }
      return res.job
    }
    // 同步失败：标记 _dirty
    app().markDirty(['jobs', 'progress', 'mine'])
    return localJob
  },

  /** 更新岗位 */
  updateJob: async function (data) {
    const cache = read('jobs')
    let localList = (cache ? cache.data : []) || []
    const idx = localList.findIndex(j => j._id === data.jobId)
    const backup = idx >= 0 ? { ...localList[idx] } : null
    if (idx >= 0) {
      Object.assign(localList[idx], data)
      localList[idx].updatedAt = new Date()
      write('jobs', localList)
      app().markDirty(['jobs', 'progress'])
    }
    const res = await api.updateJob(data)
    if (res.success && res.job) {
      const fresh = read('jobs')
      if (fresh && fresh.data) {
        write('jobs', fresh.data.map(j => j._id === data.jobId ? res.job : j))
      }
      return res.job
    }
    // 回滚
    if (backup && idx >= 0) {
      localList[idx] = backup
      write('jobs', localList)
    }
    app().markDirty(['jobs', 'progress'])
    return backup
  },

  /** 删除岗位 */
  deleteJob: async function (jobId) {
    const cache = read('jobs')
    let localList = (cache ? cache.data : []) || []
    const backup = localList.filter(j => j._id !== jobId)
    write('jobs', backup)
    remove('stats_week'); remove('stats_month')
    app().markDirty(['jobs', 'progress', 'mine'])

    const res = await api.deleteJob(jobId)
    if (!res.success) {
      // 回滚
      write('jobs', localList)
      app().markDirty(['jobs', 'progress', 'mine'])
    }
    return res
  },

  /** 推进岗位状态 */
  updateJobStatus: async function (data) {
    const cache = read('jobs')
    let localList = (cache ? cache.data : []) || []
    const idx = localList.findIndex(j => j._id === data.jobId)
    const backup = idx >= 0 ? { ...localList[idx] } : null
    if (idx >= 0 && backup) {
      const serverTime = new Date()
      backup.status = data.newStatus
      if (!backup.statusHistory) backup.statusHistory = []
      backup.statusHistory.push({ status: data.newStatus, time: serverTime, note: data.note || '' })
      backup.updatedAt = serverTime; backup.postponeCount = 0
      if (data.newStatus === '已投递') { const d = new Date(); d.setDate(d.getDate() + 3); backup.nextActionDate = d }
      else if (data.newStatus === '面试中') { const d = new Date(); d.setDate(d.getDate() + 1); backup.nextActionDate = d }
      else if (data.newStatus === 'Offer' || data.newStatus === '已拒绝') backup.nextActionDate = null
      else backup.nextActionDate = serverTime
      write('jobs', localList)
      app().markDirty(['jobs', 'progress'])
    }
    const res = await api.updateJobStatus(data)
    if (res.success && res.job) {
      const fresh = read('jobs')
      if (fresh && fresh.data) {
        write('jobs', fresh.data.map(j => j._id === data.jobId ? res.job : j))
      }
      return res.job
    }
    if (backup && idx >= 0) { localList[idx] = backup; write('jobs', localList) }
    app().markDirty(['jobs', 'progress'])
    return backup
  },

  /** 添加任务 */
  addTask: async function (data) {
    const cache = read('tasks')
    const localList = (cache ? cache.data : []) || []
    const tempId = '_local_' + Date.now()
    const now = new Date()
    const repeatRule = data.repeatRule || { type: 'none', daysOfWeek: [] }
    const localTask = {
      _id: tempId, title: data.title.trim(), note: (data.note || '').trim(),
      priority: Number(data.priority) || 2, module: data.module || 'custom',
      estimatedMinutes: Number(data.estimatedMinutes) || 0, deadline: data.deadline || '',
      repeatRule, enabled: true, postponeCount: 0, lastCompletedAt: null,
      createdAt: now, updatedAt: now
    }
    write('tasks', [localTask, ...localList])
    remove('stats_week'); remove('stats_month')
    app().markDirty(['tasks', 'progress', 'mine'])

    const res = await api.addTask(data)
    if (res.success && res.task) {
      const fresh = read('tasks')
      if (fresh && fresh.data) {
        write('tasks', fresh.data.map(t => t._id === tempId ? res.task : t))
      }
      return res.task
    }
    app().markDirty(['tasks', 'progress', 'mine'])
    return localTask
  },

  /** 更新任务 */
  updateTask: async function (data) {
    const cache = read('tasks')
    let localList = (cache ? cache.data : []) || []
    const idx = localList.findIndex(t => t._id === data.taskId)
    const backup = idx >= 0 ? { ...localList[idx] } : null
    if (idx >= 0) {
      Object.assign(localList[idx], data)
      localList[idx].updatedAt = new Date()
      write('tasks', localList)
      app().markDirty(['tasks', 'progress'])
    }
    const res = await api.updateTask(data)
    if (res.success && res.task) {
      const fresh = read('tasks')
      if (fresh && fresh.data) {
        write('tasks', fresh.data.map(t => t._id === data.taskId ? res.task : t))
      }
      return res.task
    }
    if (backup && idx >= 0) { localList[idx] = backup; write('tasks', localList) }
    app().markDirty(['tasks', 'progress'])
    return backup
  },

  /** 删除任务 */
  deleteTask: async function (taskId) {
    const cache = read('tasks')
    let localList = (cache ? cache.data : []) || []
    const backup = localList.filter(t => t._id !== taskId)
    write('tasks', backup)
    remove('stats_week'); remove('stats_month')
    app().markDirty(['tasks', 'progress', 'mine'])

    const res = await api.deleteTask(taskId)
    if (!res.success) { write('tasks', localList); app().markDirty(['tasks', 'progress', 'mine']) }
    return res
  },

  /** 完成一条行动 */
  completeAction: async function (actionId) {
    // 乐观更新本地
    const cache = read('today')
    if (cache && cache.data) {
      const idx = cache.data.findIndex(a => a._id === actionId)
      if (idx >= 0) { cache.data[idx].completed = true; write('today', cache.data) }
    }
    app().markDirty(['today', 'mine'])
    const res = await api.completeAction(actionId)
    if (res.success) {
      // 如果 action 关联了岗位/任务，它们的缓存也过期了
      remove('stats_week'); remove('stats_month')
      app().markDirty(['today', 'progress', 'mine'])
    }
    return res
  },

  /** 推迟一条行动 */
  postponeAction: async function (actionId, postponeType) {
    const cache = read('today')
    if (cache && cache.data) {
      const idx = cache.data.findIndex(a => a._id === actionId)
      if (idx >= 0) { cache.data[idx].postponed = true; write('today', cache.data) }
    }
    app().markDirty(['today'])
    const res = await api.postponeAction(actionId, postponeType)
    if (res.success) {
      remove('stats_week'); remove('stats_month')
      app().markDirty(['today', 'progress', 'mine'])
    }
    return res
  },

  /** 生成/刷新今日清单 */
  generateDailyActions: async function (forceRegenerate = false) {
    const res = await api.generateDailyActions(forceRegenerate)
    if (res.success) { write('today', res.actions); clearDirty('today') }
    return res
  },

  /** 更新偏好 → modulePrefs */
  updatePreference: async function (data) {
    const mod = data.module || 'jobseeker'
    const cache = read('user')
    if (cache && cache.data) {
      if (!cache.data.modulePrefs) cache.data.modulePrefs = {}
      if (!cache.data.modulePrefs[mod]) cache.data.modulePrefs[mod] = {}
      cache.data.modulePrefs[mod].dailyLimit = Number(data.dailyLimit)
      write('user', cache.data)
    }
    const res = await api.updatePreference(data)
    if (res.success) { remove('user'); app().markDirty(['today', 'progress']) }
    return res
  },

  // ==================== 全量同步 ====================

  /** 启动时全量拉取并写缓存 */
  syncAll: async function () {
    try {
      const [trackedRes, tasksRes, user] = await Promise.all([
        api.getTrackedItems(),
        api.getTaskList(),
        app().getUserInfo()
      ])
      if (trackedRes.success) write('tracked', trackedRes.items)
      if (tasksRes.success) write('tasks', tasksRes.tasks)
      if (user) write('user', user)

      // 尝试拉今日清单（本地算法，不依赖 daily_actions）
      const todayRes = await api.getTodayActions()
      if (todayRes.success && todayRes.actions.length > 0) {
        write('today', todayRes.actions)
      }
    } catch (_) { /* 启动同步失败不阻塞 */ }
  }
}
