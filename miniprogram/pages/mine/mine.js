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
    avatarText: '冒',
    dailyLimit: 5,
    userModules: ['jobseeker', 'custom'],
    allModules: phrases.MODULES || []    // WXML 渲染用
  },

  onShow() {
    // 缓存干净直接跳过
    if (!app.globalData.dirty.mine) return
    this.loadData()
  },

  loadData() {
    app.getUserInfo().then(user => {
      const nickname = (user && user.nickname) || '冒险者'
      // 从 modulePrefs 读取 jobseeker 模块的 dailyLimit（兼容旧 preferences）
      const jobseekerCfg = phrases.getModuleConfig('jobseeker', user)
      const dailyLimit = jobseekerCfg.dailyLimit
      const userModules = (user && user.modules) || ['jobseeker', 'custom']
      // 预计算勾选态（WXML 不支持 .indexOf()）
      const allModules = phrases.MODULES.map(function (m) {
        return Object.assign({}, m, { checked: userModules.indexOf(m.key) > -1 })
      })
      this.setData({ userInfo: user, avatarText: nickname[0], dailyLimit, userModules, allModules })
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

  // 格式化统计数据（WXML 不能调 .toFixed()，提前算好）
  formatStats(summary) {
    const rate = summary.completionRate
    const item = phrases.ENCOURAGEMENT.find(e => rate >= e.min) || phrases.ENCOURAGEMENT[phrases.ENCOURAGEMENT.length - 1]
    return {
      completed: summary.completed,
      total: summary.total,
      completionRate: Math.round(rate * 100),
      moodText: item.text
    }
  },

  // ========== 昵称编辑 ==========
  onEditNickname() {
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '输入新昵称',
      success: (res) => {
        if (res.confirm && res.content && res.content.trim()) {
          const nickname = res.content.trim()
          const db = wx.cloud.database()
          const user = this.data.userInfo
          if (user && user._id) {
            db.collection('users').doc(user._id).update({ data: { nickname } }).then(() => {
              app.globalData.userInfo.nickname = nickname
              this.setData({ 'userInfo.nickname': nickname, avatarText: nickname[0] })
              wx.showToast({ title: '昵称已更新', icon: 'success' })
            })
          }
        }
      }
    })
  },

  // ========== 模块开关 ==========
  onModuleToggle(e) {
    const key = e.currentTarget.dataset.key
    var modules = this.data.userModules.slice()
    const oldModules = modules.slice()
    const idx = modules.indexOf(key)
    if (idx > -1) modules.splice(idx, 1)
    else modules.push(key)

    // 判断变更方向
    var added = modules.filter(function (m) { return oldModules.indexOf(m) === -1 })

    const db = wx.cloud.database()
    const user = this.data.userInfo
    if (user && user._id) {
      db.collection('users').doc(user._id).update({ data: { modules } }).then(() => {
        app.globalData.userInfo.modules = modules
        this.setData({
          userModules: modules,
          allModules: phrases.MODULES.map(function (m) {
            return Object.assign({}, m, { checked: modules.indexOf(m.key) > -1 })
          })
        })
        // 模块变更始终通知 today 页本地重建（不调云函数）
        // added.length === 0 → 只关模块，本地 rebuild 即生效
        // added.length > 0  → 开了新模块，本地 rebuild + 后台静默刷新
        app.markDirty(['today'], 'moduleChange')
        app.markDirty(['progress'])
      })
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
