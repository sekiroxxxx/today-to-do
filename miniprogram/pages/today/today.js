const api = require('../../utils/api')
const app = getApp()
const phrases = require('../../utils/phrases')

// Session 级"已处理"黑名单：记录本次 session 内完成或推迟的 sourceId
// 用户下拉刷新时清空（主动刷新 = 接受全量重新评估）
let dismissedSourceIds = []
let isRefreshing = false   // 防止下拉刷新并发

Page({
  data: {
    actions: [],
    loading: true,
    empty: false,
    allDone: false,
    todayGenerated: false,     // 今日是否已生成过清单（区分新用户 vs 全部完成）
    todayDate: '',
    sessionPostponeCount: 0,
    showPostponeHint: false,
    isOffline: false
  },

  onShow() {
    this.setData({ isOffline: app.globalData.isOffline || false })
    if (!app.globalData.dirty.today) return

    const hasData = this.data.actions.length > 0
    this.loadTodayActions(!hasData)
  },

  loadTodayActions(showLoading = false) {
    if (showLoading) {
      this.setData({ loading: true })
    }

    // 脏标记为 true → 强制重新生成，确保禁用/删除的源任务被算法排除
    const fetch = app.globalData.dirty.today
      ? api.generateDailyActions(true)
      : api.getTodayActions().then(res => {
          if (res.actions && res.actions.length > 0) return res
          return api.generateDailyActions().then(genRes => ({ actions: genRes.actions || [], date: genRes.date, generated: true }))
        })

    fetch.then(res => {
      const filtered = this.filterDismissed(res.actions || [])
      const hasActions = filtered.length > 0
      const generated = res.generated !== undefined && res.generated !== false
      this.setData({
        actions: filtered,
        empty: !hasActions,
        // 只有之前已有过任务 + 现在全清空了才算"全部完成"
        // 新用户首次生成 → todayGenerated 为 false → 不庆祝
        allDone: !hasActions && this.data.todayGenerated,
        todayGenerated: generated || this.data.todayGenerated,
        todayDate: res.date,
        loading: false,
        sessionPostponeCount: 0,
        showPostponeHint: false
      })
    }).finally(() => {
      app.globalData.dirty.today = false
    })
  },

  onGoToTasks() {
    wx.switchTab({ url: '/pages/tasks/tasks' })
  },

  onPullDownRefresh() {
    // 防止快速多次下拉刷新并发执行
    if (isRefreshing) {
      wx.stopPullDownRefresh()
      return
    }
    isRefreshing = true
    wx.showNavigationBarLoading()

    const refresh = app.globalData.dirty.today
      ? api.generateDailyActions(true)
      : api.getTodayActions().then(res => ({ actions: res.actions || [] }))

    refresh.then(res => {
      const filtered = this.filterDismissed(res.actions || [])
      this.setData({
        actions: filtered,
        empty: filtered.length === 0,
        allDone: filtered.length === 0,
        todayGenerated: true,
        todayDate: res.date || this.data.todayDate,
        sessionPostponeCount: 0,
        showPostponeHint: false
      })
      app.globalData.dirty.today = false
      dismissedSourceIds = []
      wx.hideNavigationBarLoading()
      wx.stopPullDownRefresh()
      isRefreshing = false
    })
  },

  onComplete(e) {
    const { id } = e.detail
    const done = this.data.actions.find(a => a._id === id)
    if (done && done.sourceId) {
      dismissedSourceIds.push(done.sourceId)
    }

    const actions = this.data.actions.filter(a => a._id !== id)
    const allDone = actions.length === 0 && this.data.todayGenerated
    this.setData({ actions, empty: actions.length === 0 && !allDone, allDone })
    app.markDirty(['today', 'mine'])
  },

  onPostpone(e) {
    const { id, type } = e.detail
    const postponed = this.data.actions.find(a => a._id === id)
    if (postponed && postponed.sourceId) {
      dismissedSourceIds.push(postponed.sourceId)
    }

    const actions = this.data.actions.filter(a => a._id !== id)
    const sessionPostponeCount = this.data.sessionPostponeCount + 1
    const showPostponeHint = sessionPostponeCount >= 3 && actions.length === 0

    this.setData({ actions, empty: actions.length === 0, sessionPostponeCount, showPostponeHint })

    if (type === 'skip') {
      api.generateDailyActions(true).then(genRes => {
        const fresh = this.filterDismissed(genRes.actions || [])
        this.setData({ actions: fresh, empty: fresh.length === 0 })
        app.globalData.dirty.today = false
      })
    }
    app.markDirty(['mine'])
  },

  filterDismissed(actions) {
    if (dismissedSourceIds.length === 0) return actions
    return actions.filter(a => !dismissedSourceIds.includes(a.sourceId))
  }
})
