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

    // ========== 网络状态监听 ==========
    wx.onNetworkStatusChange(res => {
      this.globalData.isOffline = !res.isConnected
    })

    // ========== 全局数据 ==========
    this.globalData = {
      userInfo: null,           // 当前用户信息（login 后填充）
      // 缓存脏标记：true=数据已过期需重新请求，false=缓存有效
      // 用户做增删改操作后标记为 true，成功拉取数据后标记为 false
      dirty: {
        today: true,            // 初始为 true，首次进入各 Tab 时会拉数据
        jobs: true,
        tasks: true,
        mine: true
      }
    }
  },

  /**
   * 标记指定 Tab 的数据需要刷新
   * @param {string|string[]} tabs - 'today' | 'jobs' | 'tasks' | 'mine'
   */
  markDirty: function (tabs) {
    const list = Array.isArray(tabs) ? tabs : [tabs]
    list.forEach(t => {
      if (this.globalData.dirty[t] !== undefined) {
        this.globalData.dirty[t] = true
      }
    })
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
        if (res.result && res.result.user) {
          this.globalData.userInfo = res.result.user
          // 存本地缓存，断网时兜底
          wx.setStorageSync('userInfo', res.result.user)
        }
        return this.globalData.userInfo
      })
      .catch(() => {
        // 断网兜底：读缓存 → 缓存也没有就返回最小可用对象
        const cached = wx.getStorageSync('userInfo')
        if (cached) {
          this.globalData.userInfo = cached
          return cached
        }
        return { _id: '', _openid: '', nickname: '冒险者', persona: '', preferences: { dailyLimit: 5 } }
      })
  }
})
