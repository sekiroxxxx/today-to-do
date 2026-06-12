// 今日行动清单 — 小程序入口
const api = require('./utils/api')

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

    // ========== 数据预热 ==========
    // 启动时预拉取，后续页面 onShow 走 dirty 标记判断是否重新请求
    api.getTrackedItems().catch(function () {})
    api.getTaskList().catch(function () {})

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
        today: true,
        progress: true,
        jobs: true,
        tasks: true,
        mine: true
      },
      // 脏标记变更原因，today/progress 等页面按原因走不同刷新策略
      dirtyReason: {}
    }
  },

  /**
   * 标记指定 Tab 的数据需要刷新
   * @param {string|string[]} tabs - 'today' | 'jobs' | 'tasks' | 'mine'
   */
  markDirty: function (tabs, reason) {
    const list = Array.isArray(tabs) ? tabs : [tabs]
    list.forEach(t => {
      if (this.globalData.dirty[t] !== undefined) {
        this.globalData.dirty[t] = true
      }
    })
    if (reason) {
      list.forEach(t => { this.globalData.dirtyReason[t] = reason })
    } else {
      // 普通脏标记（完成/推迟等），清除之前的 reason 避免误入模块切换分支
      list.forEach(t => { delete this.globalData.dirtyReason[t] })
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
        return { _id: '', _openid: '', nickname: '冒险者', modules: ['jobseeker', 'custom'], modulePrefs: { jobseeker: { dailyLimit: 5 } } }
      })
  }
})
