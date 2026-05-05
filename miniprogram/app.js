// 今日行动清单 — 小程序入口
App({
  onLaunch: function () {
    // ========== 云开发初始化 ==========
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上版本的基础库以使用云能力')
      return
    }

    wx.cloud.init({
      // env 参数：决定云函数请求发送到哪个云环境
      // 留空则使用创建项目时关联的默认环境
      // 如果你的云环境 ID 不是默认的，去云开发控制台右上角复制环境 ID 填到这里
      env: '',
      traceUser: true  // 在云函数日志中记录用户访问
    })

    // ========== 全局数据 ==========
    this.globalData = {
      userInfo: null,           // 当前用户信息（login 后填充）
      todayActions: [],         // 今日清单缓存
      todayActionsDate: ''      // 缓存的日期
    }
  },

  // ========== 全局方法 ==========

  /**
   * 获取当前用户信息（从缓存或重新登录）
   * @returns {Promise<Object>} user 对象
   */
  getUserInfo: function () {
    if (this.globalData.userInfo) {
      return Promise.resolve(this.globalData.userInfo)
    }
    return wx.cloud.callFunction({ name: 'login', data: {} })
      .then(res => {
        if (res.result.user) {
          this.globalData.userInfo = res.result.user
        }
        return this.globalData.userInfo
      })
  }
})
