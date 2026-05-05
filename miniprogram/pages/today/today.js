const api = require('../../utils/api')

Page({
  data: {
    actions: [],
    loading: true,
    empty: false,
    todayDate: ''
  },

  onShow() {
    this.loadTodayActions()
  },

  loadTodayActions() {
    this.setData({ loading: true })

    api.getTodayActions().then(res => {
      if (res.actions && res.actions.length > 0) {
        this.setData({ actions: res.actions, empty: false, todayDate: res.date })
      } else {
        // 今日还没生成，调用生成
        return api.generateDailyActions().then(genRes => {
          this.setData({
            actions: genRes.actions || [],
            empty: !genRes.actions || genRes.actions.length === 0,
            todayDate: genRes.date
          })
        })
      }
    }).finally(() => {
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

  onComplete(e) {
    const { id } = e.detail
    // 将在组件中处理完成逻辑后触发，这里刷新列表
    this.loadTodayActions()
  },

  onPostpone(e) {
    const { id, type } = e.detail
    // 将在组件中处理推迟逻辑后触发，需要补入备选
    api.postponeAction(id, type).then(res => {
      if (res.needRegenerate) {
        api.generateDailyActions(true).then(genRes => {
          this.setData({ actions: genRes.actions || [] })
        })
      }
    })
  }
})
