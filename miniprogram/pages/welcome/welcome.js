// Welcome v1.1 — 模块勾选
const app = getApp()
const phrases = require('../../utils/phrases')

Page({
  data: {
    checking: true,
    starting: false,
    allModules: (phrases.MODULES || []).map(function (m) {
      return Object.assign({}, m, { checked: ['jobseeker', 'custom'].indexOf(m.key) > -1 })
    }),
    selected: ['jobseeker', 'custom']
  },

  onShow() {
    app.getUserInfo().then(user => {
      if (user && user._id && user.modules && user.modules.length > 0) {
        wx.switchTab({ url: '/pages/today/today' })
      } else {
        this.setData({ checking: false })
      }
    })
  },

  // ========== 勾选模块 ==========
  onModuleCheck(e) {
    const key = e.currentTarget.dataset.key
    var selected = this.data.selected.slice()
    const idx = selected.indexOf(key)
    if (idx > -1) selected.splice(idx, 1)
    else selected.push(key)
    var allModules = phrases.MODULES.map(function (m) {
      return Object.assign({}, m, { checked: selected.indexOf(m.key) > -1 })
    })
    this.setData({ selected, allModules })
  },

  // ========== 开始 ==========
  onStart() {
    if (this.data.selected.length === 0) {
      return wx.showToast({ title: '请至少选择一个模块', icon: 'none' })
    }
    this.setData({ starting: true })

    wx.cloud.callFunction({ name: 'login', data: {} })
      .then(res => {
        if (!res.result || !res.result.user) {
          wx.showToast({ title: '网络异常', icon: 'none' })
          this.setData({ starting: false })
          return
        }
        const user = res.result.user
        app.globalData.userInfo = user
        const db = wx.cloud.database()
        return db.collection('users').doc(user._id).update({
          data: {
            modules: this.data.selected
          }
        }).then(() => {
          app.globalData.userInfo.modules = this.data.selected
          wx.switchTab({ url: '/pages/today/today' })
        })
      })
      .catch(() => {
        wx.showToast({ title: '网络异常', icon: 'none' })
        this.setData({ starting: false })
      })
  },

  onSkip() {
    wx.switchTab({ url: '/pages/today/today' })
  }
})
