const api = require('../../utils/api')

Page({
  data: {
    actions: [],
    loading: true,
    empty: false,
    todayDate: ''
  },

  onShow() {
    // 已有数据 → 静默刷新；首次加载 → 显示骨架屏
    const hasData = this.data.actions.length > 0
    this.loadTodayActions(!hasData)
  },

  /**
   * 加载今日清单
   * @param {boolean} showLoading - 是否显示骨架屏。false=静默刷新，不打断用户
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
        // 今日还没生成，调用生成
        return api.generateDailyActions().then(genRes => {
          this.setData({
            actions: genRes.actions || [],
            empty: !genRes.actions || genRes.actions.length === 0,
            todayDate: genRes.date,
            loading: false
          })
        })
      }
    }).catch(() => {
      this.setData({ loading: false })
    })
  },

  onPullDownRefresh() {
    api.generateDailyActions(true).then(res => {
      this.setData({
        actions: res.actions || [],
        empty: !res.actions || res.actions.length === 0,
        todayDate: res.date
      })
      wx.stopPullDownRefresh()
    })
  },

  onComplete() {
    // 卡片消失后静默刷新，不闪骨架屏
    this.loadTodayActions(true)
  },

  onPostpone(e) {
    const { id, type } = e.detail
    api.postponeAction(id, type).then(res => {
      if (res.needRegenerate) {
        api.generateDailyActions(true).then(genRes => {
          this.setData({ actions: genRes.actions || [] })
        })
      }
    })
  }
})
