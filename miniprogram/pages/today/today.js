const api = require('../../utils/api')
const app = getApp()
const phrases = require('../../utils/phrases')

// Session 级"已处理"黑名单：记录本次 session 内完成或推迟的 sourceId
// 下拉刷新 / skip 重新生成时，过滤掉这些已处理的候选项
// 小程序关闭后自动清空，下次进入重新评估
let dismissedSourceIds = []

Page({
  data: {
    actions: [],
    loading: true,
    empty: false,
    allDone: false,
    todayDate: '',
    sessionPostponeCount: 0,
    showPostponeHint: false
  },

  onShow() {
    if (!app.globalData.dirty.today) return

    const hasData = this.data.actions.length > 0
    this.loadTodayActions(!hasData)
  },

  loadTodayActions(showLoading = false) {
    if (showLoading) {
      this.setData({ loading: true })
    }

    api.getTodayActions().then(res => {
      if (res.actions && res.actions.length > 0) {
        const filtered = this.filterDismissed(res.actions)
        this.setData({
          actions: filtered, empty: filtered.length === 0, allDone: false,
          todayDate: res.date, loading: false,
          sessionPostponeCount: 0, showPostponeHint: false
        })
      } else {
        return api.generateDailyActions().then(genRes => {
          const filtered = this.filterDismissed(genRes.actions || [])
          this.setData({
            actions: filtered,
            empty: filtered.length === 0,
            allDone: filtered.length === 0 && genRes.generated !== undefined,
            todayDate: genRes.date,
            loading: false
          })
        })
      }
    }).finally(() => {
      app.globalData.dirty.today = false
      dismissedSourceIds = []
    })
  },

  onGoToTasks() {
    wx.switchTab({ url: '/pages/tasks/tasks' })
  },

  onPullDownRefresh() {
    wx.showNavigationBarLoading()

    const refresh = app.globalData.dirty.today
      // 数据有变更 → 强制重新生成
      ? api.generateDailyActions(true)
      // 无变更 → 只读缓存，避免排序抖动
      : api.getTodayActions().then(res => ({ actions: res.actions || [] }))

    refresh.then(res => {
      const filtered = this.filterDismissed(res.actions || [])
      this.setData({
        actions: filtered,
        empty: filtered.length === 0,
        allDone: filtered.length === 0,
        todayDate: res.date || this.data.todayDate,
        sessionPostponeCount: 0,
        showPostponeHint: false
      })
      app.globalData.dirty.today = false
      wx.hideNavigationBarLoading()
      wx.stopPullDownRefresh()
    })
  },

  onComplete(e) {
    const { id } = e.detail
    // 记录已处理的 sourceId
    const done = this.data.actions.find(a => a._id === id)
    if (done && done.sourceId) {
      dismissedSourceIds.push(done.sourceId)
    }

    const actions = this.data.actions.filter(a => a._id !== id)
    const allDone = actions.length === 0 && !this.data.empty
    this.setData({ actions, empty: actions.length === 0 && !allDone, allDone })
    app.markDirty(['today', 'mine'])
  },

  onPostpone(e) {
    const { id, type } = e.detail

    // 记录已处理的 sourceId
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

  // 过滤掉 session 内已处理过的 sourceId
  filterDismissed(actions) {
    if (dismissedSourceIds.length === 0) return actions
    return actions.filter(a => !dismissedSourceIds.includes(a.sourceId))
  }
})
