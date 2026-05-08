const api = require('../../utils/api')
const app = getApp()
const phrases = require('../../utils/phrases')

// Session 级"已处理"黑名单：记录本次 session 内完成或推迟的 sourceId
// 用户下拉刷新时清空（主动刷新 = 接受全量重新评估）
let dismissedSourceIds = []

Page({
  data: {
    actions: [],
    loading: true,
    empty: false,
    allDone: false,
    todayGenerated: false,     // 今日是否已生成过清单（区分新用户 vs 全部完成）
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
          actions: filtered, empty: false, allDone: false,
          todayGenerated: true,
          todayDate: res.date, loading: false,
          sessionPostponeCount: 0, showPostponeHint: false
        })
      } else {
        return api.generateDailyActions().then(genRes => {
          const filtered = this.filterDismissed(genRes.actions || [])
          const generated = genRes.generated !== undefined
          this.setData({
            actions: filtered,
            empty: filtered.length === 0 && !generated,
            allDone: filtered.length === 0 && generated,
            todayGenerated: generated || this.data.todayGenerated,
            todayDate: genRes.date,
            loading: false
          })
        })
      }
    }).finally(() => {
      app.globalData.dirty.today = false
      // B 修复：不再清空 dismissedSourceIds
      // 黑名单贯穿整个 session，仅在用户主动下拉刷新时清空
    })
  },

  onGoToTasks() {
    wx.switchTab({ url: '/pages/tasks/tasks' })
  },

  onPullDownRefresh() {
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
      dismissedSourceIds = []   // B 修复：用户主动刷新 → 清空黑名单
      wx.hideNavigationBarLoading()
      wx.stopPullDownRefresh()
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
