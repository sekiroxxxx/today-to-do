// Welcome 欢迎页 — v1.0 新用户引导
const app = getApp()

Page({
  data: {
    checking: true,
    starting: false
  },

  onShow() {
    // 已登录且 persona 有值 → 老用户，直接跳过
    app.getUserInfo().then(user => {
      if (user && user._id && user.persona && user.persona.trim()) {
        wx.switchTab({ url: '/pages/today/today' })
      } else {
        // persona 为空 → 新用户或未选画像，停在欢迎页
        this.setData({ checking: false })
      }
    })
  },

  // ========== 点击"开始" ==========
  onStart() {
    this.setData({ starting: true })

    // 1. 调 login 确保用户记录存在
    wx.cloud.callFunction({ name: 'login', data: {} })
      .then(res => {
        if (!res.result || !res.result.user) {
          wx.showToast({ title: '网络异常，请重试', icon: 'none' })
          this.setData({ starting: false })
          return
        }

        const user = res.result.user
        app.globalData.userInfo = user

        // 2. 设置 persona 为默认画像（v1.0 固定 'daily'，v1.1 改为画像选择）
        const db = wx.cloud.database()
        return db.collection('users').doc(user._id).update({
          data: { persona: 'daily' }
        }).then(() => {
          app.globalData.userInfo.persona = 'daily'
          wx.switchTab({ url: '/pages/today/today' })
        })
      })
      .catch(() => {
        wx.showToast({ title: '网络异常，请重试', icon: 'none' })
        this.setData({ starting: false })
      })
  },

  // ========== 点击"不是第一次？" ==========
  onSkip() {
    wx.switchTab({ url: '/pages/today/today' })
  }
})
