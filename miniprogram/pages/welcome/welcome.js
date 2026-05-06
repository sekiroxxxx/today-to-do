// Welcome 欢迎页 — v1.0 新用户引导
const app = getApp()

Page({
  data: {
    checking: true,   // 正在检查是否老用户
    starting: false   // 正在首次登录
  },

  onShow() {
    // 先查用户是否已存在（老用户自动跳过欢迎页）
    app.getUserInfo().then(user => {
      if (user && user._id) {
        // 老用户：直接进入日常页
        wx.switchTab({ url: '/pages/today/today' })
      } else {
        // 新用户：停在本页面等点击
        this.setData({ checking: false })
      }
    })
  },

  // ========== 点击"开始" ==========
  onStart() {
    this.setData({ starting: true })

    // 调 login 创建用户记录（含 persona='' 占位，v1.1 启用）
    wx.cloud.callFunction({ name: 'login', data: {} })
      .then(res => {
        if (res.result && res.result.user) {
          app.globalData.userInfo = res.result.user
          wx.switchTab({ url: '/pages/today/today' })
        } else {
          wx.showToast({ title: '网络异常，请重试', icon: 'none' })
          this.setData({ starting: false })
        }
      })
      .catch(() => {
        wx.showToast({ title: '网络异常，请重试', icon: 'none' })
        this.setData({ starting: false })
      })
  },

  // ========== 点击"不是第一次？" ==========
  onSkip() {
    // 老用户测试：不走 login，直接进日常页
    // 日常页的 onShow 会调 login 走正常登录流程
    wx.switchTab({ url: '/pages/today/today' })
  }
})
