// 我的页面
const app = getApp()
const api = require('../../utils/api')
const phrases = require('../../utils/phrases')

Page({
  data: {
    userInfo: null,
    currentRange: 'week',
    stats: null,
    funnel: null,
    statsFormatted: null,
    avatarText: '冒'        // WXML 不能取 [0]，首字在 JS 算好
  },

  onShow() {
    // 缓存干净直接跳过
    if (!app.globalData.dirty.mine) return
    this.loadData()
  },

  loadData() {
    app.getUserInfo().then(user => {
      const nickname = (user && user.nickname) || '冒险者'
      this.setData({ userInfo: user, avatarText: nickname[0] })
    })

    // 获取统计数据
    api.getStats(this.data.currentRange).then(res => {
      if (res.success) {
        this.setData({
          stats: res.summary,
          funnel: res.funnel,
          statsFormatted: this.formatStats(res.summary)
        })
      }
      app.globalData.dirty.mine = false
    })
  },

  // ========== 切换统计范围 ==========
  onRangeSwitch(e) {
    const range = e.currentTarget.dataset.range
    this.setData({ currentRange: range })
    api.getStats(range).then(res => {
      if (res.success) {
        this.setData({ stats: res.summary, funnel: res.funnel, statsFormatted: this.formatStats(res.summary) })
      }
    })
  },

  // ========== 调整每日清单数量 ==========
  onDailyLimitChange(e) {
    // 此功能后续可扩展为写入 users 集合的 preferences.dailyLimit
    const limit = e.detail.value
    wx.showToast({ title: `每日清单上限：${limit} 条`, icon: 'none' })
    // TODO: 调用云函数更新用户偏好
    // api.updatePreference({ dailyLimit: limit })
  },

  // 格式化统计数据（WXML 不能调 .toFixed()，提前算好）
  formatStats(summary) {
    const rate = summary.completionRate
    const item = phrases.ENCOURAGEMENT.find(e => rate >= e.min) || phrases.ENCOURAGEMENT[phrases.ENCOURAGEMENT.length - 1]
    return {
      completed: summary.completed,
      postponed: summary.postponed,
      total: summary.total,
      completionRate: Math.round(rate * 100),
      moodText: item.text
    }
  },

  // ========== 通用 ==========
  onClearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '将清除本地缓存的今日清单数据',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorage()
          wx.showToast({ title: '已清除', icon: 'success' })
        }
      }
    })
  }
})
