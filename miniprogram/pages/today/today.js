const api = require('../../utils/api')
const app = getApp()
const phrases = require('../../utils/phrases')
const algorithm = require('../../utils/algorithm')

let dismissedSourceIds = []
let isRefreshing = false

Page({
  data: {
    modules: [],               // [{ key, icon, name, color, actions, open, count }]
    loading: true,
    empty: false,
    allDone: false,
    todayGenerated: false,
    todayDate: '',
    isOffline: false
  },

  onShow() {
    this.setData({ isOffline: app.globalData.isOffline || false })

    // 读本地缓存（断网兜底）
    const cache = wx.getStorageSync('dailyCache')
    if (!this.data.modules.length && cache && cache.date === getDateString(new Date())) {
      this.setData({ modules: cache.modules, todayDate: cache.date, loading: false })
    }

    if (!app.globalData.dirty.today) return
    const hasData = this.data.modules.length > 0
    this.loadTodayActions(!hasData)
  },

  loadTodayActions(showLoading = false) {
    if (showLoading) this.setData({ loading: true })

    const fetch = app.globalData.dirty.today
      ? api.generateDailyActions(true)
      : api.getTodayActions().then(res => {
          if (res.actions && res.actions.length > 0) return res
          return api.generateDailyActions().then(genRes => ({ actions: genRes.actions || [], date: genRes.date, generated: true }))
        })

    fetch.then(res => {
      const filtered = this.filterDismissed(res.actions || [])
      const modules = this.buildModules(filtered)
      const hasActions = modules.length > 0
      const generated = res.generated !== undefined && res.generated !== false

      this.setData({
        modules,
        empty: !hasActions && !generated,
        allDone: !hasActions && this.data.todayGenerated,
        todayGenerated: generated || this.data.todayGenerated,
        todayDate: res.date,
        loading: false
      })
      // 写缓存
      wx.setStorageSync('dailyCache', { date: res.date, modules })
    }).finally(() => { app.globalData.dirty.today = false })
  },

  // 按 module 分组
  buildModules(actions) {
    const map = {}
    actions.forEach(a => {
      const m = a.module || (a.sourceType === 'job' ? 'jobseeker' : 'custom')
      if (!map[m]) map[m] = []
      map[m].push(a)
    })

    return phrases.MODULES
      .filter(mod => map[mod.key] && map[mod.key].length > 0)
      .map(mod => ({
        icon: mod.icon,
        name: mod.name,
        color: mod.color,
        key: mod.key,
        actions: map[mod.key],
        open: true,
        count: map[mod.key].length
      }))
  },

  onModuleToggle(e) {
    const key = e.currentTarget.dataset.key
    const modules = this.data.modules.map(m =>
      m.key === key ? Object.assign({}, m, { open: !m.open }) : m
    )
    this.setData({ modules })
  },

  onPullDownRefresh() {
    if (isRefreshing) { wx.stopPullDownRefresh(); return }
    isRefreshing = true
    wx.showNavigationBarLoading()

    const refresh = app.globalData.dirty.today
      ? api.generateDailyActions(true)
      : api.getTodayActions().then(res => ({ actions: res.actions || [] }))

    refresh.then(res => {
      const filtered = this.filterDismissed(res.actions || [])
      const modules = this.buildModules(filtered)
      this.setData({
        modules,
        empty: modules.length === 0,
        allDone: modules.length === 0,
        todayGenerated: true,
        todayDate: res.date || this.data.todayDate
      })
      app.globalData.dirty.today = false
      dismissedSourceIds = []
      wx.hideNavigationBarLoading()
      wx.stopPullDownRefresh()
      isRefreshing = false
    })
  },

  onComplete(e) {
    const id = e.currentTarget.dataset.id
    const target = this.findAction(id)
    if (!target) return

    // 调云函数标记完成
    api.completeAction(id).then(() => {
      this.removeAction(id)
      app.markDirty(['today', 'progress', 'mine'])
    })
  },

  onPostpone(e) {
    const id = e.currentTarget.dataset.id
    const type = e.currentTarget.dataset.type || 'skip'
    const target = this.findAction(id)
    if (!target) return

    // 调云函数标记推迟
    api.postponeAction(id, type).then(() => {
      this.removeAction(id)

      if (type === 'skip') {
        api.generateDailyActions(true).then(genRes => {
          const filtered = this.filterDismissed(genRes.actions || [])
          this.setData({ modules: this.buildModules(filtered) })
          app.globalData.dirty.today = false
        })
      }
      app.markDirty(['mine'])
    })
  },

  // 从模块列表中移除一张卡片
  removeAction(actionId) {
    const target = this.findAction(actionId)
    if (target && target.sourceId) dismissedSourceIds.push(target.sourceId)

    const modules = this.data.modules.map(m => ({
      icon: m.icon, name: m.name, color: m.color, key: m.key, open: m.open,
      actions: m.actions.filter(function (a) { return a._id !== actionId }),
      count: m.actions.filter(a => a._id !== actionId).length
    })).filter(m => m.count > 0)

    const allDone = modules.length === 0 && this.data.todayGenerated
    this.setData({ modules, empty: modules.length === 0 && !allDone, allDone })
  },

  findAction(id) {
    for (const m of this.data.modules) {
      const a = m.actions.find(a => a._id === id)
      if (a) return a
    }
    return null
  },

  onGoToCreate() { wx.switchTab({ url: '/pages/create/create' }) },

  // L4.5: 本地跑算法即时渲染，避免等云函数
  runLocalAlgorithm() {
    return Promise.all([api.getJobList(), api.getTaskList()]).then(([jobRes, taskRes]) => {
      const jobs = (jobRes.jobs || []).filter(j => j.status !== 'Offer' && j.status !== '已关闭')
      const tasks = (taskRes.tasks || []).filter(t => t.enabled)
      const result = algorithm.generateDailyList({ jobs, tasks, dailyLimit: 5 })
      return result.actions.map(a => ({
        sourceType: a.sourceType,
        sourceId: a.sourceId,
        title: a.title,
        description: a.description,
        normalizedScore: a.normalizedScore,
        rawScore: a.rawScore,
        createdAt: a.createdAt,
        module: a.sourceType === 'job' ? 'jobseeker' : ((tasks.find(function (t) { return t._id === a.sourceId }) || {}).module || 'custom')
      }))
    })
  },

  filterDismissed(actions) {
    return actions.filter(a => {
      if (a.completed || a.postponed) return false
      if (dismissedSourceIds.length > 0 && dismissedSourceIds.includes(a.sourceId)) return false
      return true
    })
  }
})

function getDateString(date) {
  var y = date.getFullYear()
  var m = String(date.getMonth() + 1)
  if (m.length === 1) m = '0' + m
  var d = String(date.getDate())
  if (d.length === 1) d = '0' + d
  return y + '-' + m + '-' + d
}
