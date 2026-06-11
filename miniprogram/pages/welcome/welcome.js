// Welcome v1.1 — 模块勾选
const app = getApp()
const phrases = require('../../utils/phrases')

Page({
  data: {
    checking: true,
    starting: false,
    allModules: phrases.MODULES.map(m => ({ ...m, checked: ['jobseeker', 'custom'].includes(m.key) })),
    selected: ['jobseeker', 'custom']
  },

  onShow() {
    app.getUserInfo().then(user => {
      if (user && user._id && user.persona && user.persona.trim()) {
        wx.switchTab({ url: '/pages/today/today' })
      } else {
        this.setData({ checking: false })
      }
    })
  },

  // ========== 勾选模块 ==========
  onModuleCheck(e) {
    const key = e.currentTarget.dataset.key
    let selected = [...this.data.selected]
    const idx = selected.indexOf(key)
    if (idx > -1) selected.splice(idx, 1)
    else selected.push(key)
    const allModules = phrases.MODULES.map(m => ({ ...m, checked: selected.includes(m.key) }))
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
            persona: 'daily',
            modules: this.data.selected
          }
        }).then(() => {
          app.globalData.userInfo.persona = 'daily'
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
