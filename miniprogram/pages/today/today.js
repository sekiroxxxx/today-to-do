const api = require('../../utils/api')
const app = getApp()

Page({
  data: {
    actions: [],
    loading: true,
    empty: false,
    todayDate: ''
  },

  onShow() {
    // 缓存干净就跳过，脏了才重新请求
    if (!app.globalData.dirty.today) return

    const hasData = this.data.actions.length > 0
    this.loadTodayActions(!hasData)
  },

  /**
   * 加载今日清单
   * @param {boolean} showLoading - 首次加载显示骨架屏，切Tab静默刷新
   */
  loadTodayActions(showLoading = false) {
    if (showLoading) {
      this.setData({ loading: true })
    }

    api.getTodayActions().then(res => {
      if (res.actions && res.actions.length > 0) {
        this.setData({
          actions: res.actions, empty: false,
          todayDate: res.date, loading: false
        })
      } else {
        return api.generateDailyActions().then(genRes => {
          this.setData({
            actions: genRes.actions || [],
            empty: !genRes.actions || genRes.actions.length === 0,
            todayDate: genRes.date,
            loading: false
          })
        })
      }
    }).finally(() => {
      app.globalData.dirty.today = false
    })
  },

  onGoToTasks() {
    wx.switchTab({ url: '/pages/tasks/tasks' })
  },

  onPullDownRefresh() {
    wx.showNavigationBarLoading()
    api.generateDailyActions(true).then(res => {
      this.setData({
        actions: res.actions || [],
        empty: !res.actions || res.actions.length === 0,
        todayDate: res.date
      })
      app.globalData.dirty.today = false
      wx.hideNavigationBarLoading()
      wx.stopPullDownRefresh()
    })
  },

  onComplete(e) {
    // 直接从本地数组移除已完成卡片，不重新请求（避免页面整体重渲染）
    const { id } = e.detail
    const actions = this.data.actions.filter(a => a._id !== id)
    this.setData({ actions, empty: actions.length === 0 })
    app.markDirty(['today', 'mine'])
  },

  onPostpone(e) {
    const { id, type } = e.detail
    // 先本地移除，再异步处理
    const actions = this.data.actions.filter(a => a._id !== id)
    this.setData({ actions, empty: actions.length === 0 })

    api.postponeAction(id, type).then(res => {
      if (res.needRegenerate) {
        // 需要补入备选，重新请求完整列表
        api.generateDailyActions(true).then(genRes => {
          this.setData({ actions: genRes.actions || [] })
          app.globalData.dirty.today = false
        })
      }
      app.markDirty(['mine'])
    })
  }
})
