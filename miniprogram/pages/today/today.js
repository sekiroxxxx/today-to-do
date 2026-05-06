const api = require('../../utils/api')
const app = getApp()
const phrases = require('../../utils/phrases')

// Session 级推迟黑名单：记录本次 session 已推迟的 sourceId
// "跳过今天"触发生成时，重新生成的列表会过滤掉这些 sourceId
// session 结束后自动清空（用户关闭小程序或下次进入重新初始化）
let postponedSourceIds = []

Page({
  data: {
    actions: [],
    loading: true,
    empty: false,              // 从未生成过清单（引导态）
    allDone: false,            // 生成过但全部完成了（庆祝态）
    todayDate: '',
    sessionPostponeCount: 0,   // 本次 session 连续推迟次数
    showPostponeHint: false    // ≥3 次推迟后显示提示
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
        this.setData({
          actions: res.actions, empty: false, allDone: false,
          todayDate: res.date, loading: false,
          sessionPostponeCount: 0, showPostponeHint: false
        })
      } else {
        // 今日没查到待处理记录 → 生成或确认是否全部完成
        return api.generateDailyActions().then(genRes => {
          const hasActions = genRes.actions && genRes.actions.length > 0
          // 生成过但返回空 → 全部完成了；没生成过 → 空状态引导
          this.setData({
            actions: genRes.actions || [],
            empty: !hasActions,
            allDone: !hasActions && genRes.generated !== undefined,
            todayDate: genRes.date,
            loading: false
          })
        })
      }
    }).finally(() => {
      app.globalData.dirty.today = false
      postponedSourceIds = []    // 新一天的清单，清空 session 推迟记录
    })
  },

  onGoToTasks() {
    wx.switchTab({ url: '/pages/tasks/tasks' })
  },

  onPullDownRefresh() {
    wx.showNavigationBarLoading()
    api.generateDailyActions(true).then(res => {
      const hasActions = res.actions && res.actions.length > 0
      this.setData({
        actions: res.actions || [],
        empty: !hasActions,
        allDone: !hasActions,
        todayDate: res.date,
        sessionPostponeCount: 0,
        showPostponeHint: false
      })
      app.globalData.dirty.today = false
      postponedSourceIds = []
      wx.hideNavigationBarLoading()
      wx.stopPullDownRefresh()
    })
  },

  onComplete(e) {
    const { id } = e.detail
    const actions = this.data.actions.filter(a => a._id !== id)
    const allDone = actions.length === 0 && !this.data.empty
    this.setData({ actions, empty: actions.length === 0 && !allDone, allDone })
    app.markDirty(['today', 'mine'])
  },

  onPostpone(e) {
    const { id, type } = e.detail

    // 记录 sourceId 到黑名单（重新生成时过滤）
    const postponed = this.data.actions.find(a => a._id === id)
    if (postponed && postponed.sourceId) {
      postponedSourceIds.push(postponed.sourceId)
    }

    // 从本地列表移除
    const actions = this.data.actions.filter(a => a._id !== id)
    const sessionPostponeCount = this.data.sessionPostponeCount + 1
    const showPostponeHint = sessionPostponeCount >= 3 && actions.length === 0

    this.setData({ actions, empty: actions.length === 0, sessionPostponeCount, showPostponeHint })

    if (type === 'skip') {
      api.generateDailyActions(true).then(genRes => {
        // 过滤掉 session 里已推迟的 sourceId
        const freshActions = (genRes.actions || []).filter(
          a => !postponedSourceIds.includes(a.sourceId)
        )
        this.setData({ actions: freshActions, empty: freshActions.length === 0 })
        app.globalData.dirty.today = false
      })
    }
    app.markDirty(['mine'])
  }
})
