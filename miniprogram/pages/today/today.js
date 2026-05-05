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

  onPullDownRefresh() {
    api.generateDailyActions(true).then(res => {
      this.setData({
        actions: res.actions || [],
        empty: !res.actions || res.actions.length === 0,
        todayDate: res.date
      })
      app.globalData.dirty.today = false
      wx.stopPullDownRefresh()
    })
  },

  onComplete() {
    // 完成操作后标记需要刷新
    app.markDirty(['today', 'mine'])
    this.loadTodayActions(true)
  },

  onPostpone(e) {
    const { id, type } = e.detail
    api.postponeAction(id, type).then(res => {
      if (res.needRegenerate) {
        api.generateDailyActions(true).then(genRes => {
          this.setData({ actions: genRes.actions || [] })
          app.globalData.dirty.today = false
        })
      }
      // 推迟会影响源任务数据，标记相关 Tab 为脏
      app.markDirty(['mine'])
    })
  }
})
