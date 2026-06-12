// 推进 Tab v1.1 — 模块工作区
const api = require('../../utils/api')
const phrases = require('../../utils/phrases')
const app = getApp()

Page({
  data: {
    modules: [],
    currentModule: 'jobseeker',
    currentModuleInfo: null,
    tasks: [],
    funnel: null,
    showSheet: false,
    isLoading: false,
    dailyLimit: 5
  },

  onShow() {
    var userModules = (app.globalData.userInfo && app.globalData.userInfo.modules) || ['jobseeker', 'custom']
    var enabled = phrases.MODULES.filter(function (m) { return userModules.indexOf(m.key) > -1 })

    // 确定当前模块：上次选中的 > 已持久化的 > 第一个启用的
    var savedModule = wx.getStorageSync('progressModule')
    var activeModule = this.data.currentModule
    if (savedModule && enabled.filter(function (m) { return m.key === savedModule }).length > 0) {
      activeModule = savedModule
    }
    if (enabled.filter(function (m) { return m.key === activeModule }).length === 0) {
      activeModule = enabled.length > 0 ? enabled[0].key : 'jobseeker'
    }

    var currentModuleInfo = phrases.MODULES.find(function (m) { return m.key === activeModule }) || enabled[0]
    this.setData({ modules: enabled, currentModule: activeModule, currentModuleInfo: currentModuleInfo })

    if (!app.globalData.dirty.progress) return
    this.loadData(activeModule)
  },

  loadData(moduleKey) {
    var key = moduleKey || this.data.currentModule
    var mod = phrases.MODULES.find(function (m) { return m.key === key })
    if (mod) wx.setNavigationBarTitle({ title: mod.name })

    app.globalData.dirty.progress = false

    var info = phrases.MODULES.find(function (m) { return m.key === key })
    var dailyLimit = (app.globalData.userInfo && app.globalData.userInfo.preferences && app.globalData.userInfo.preferences.dailyLimit) || 5
    this.setData({ currentModuleInfo: info, dailyLimit: dailyLimit })

    // 获取该模块的今日任务，求职加评级 badge
    var ctx = this
    api.getTodayActions().then(function (res) {
      var tasks = (res.actions || []).filter(function (a) { return a.module === key })
        .map(function (a) {
          if (a.sourceType === 'job' && a.normalizedScore != null) {
            var tier = phrases.RATING_TIERS.filter(function (t) { return a.normalizedScore >= t.min })[0] || phrases.RATING_TIERS[phrases.RATING_TIERS.length - 1]
            a.badge = tier
          }
          return a
        })
      ctx.setData({ tasks: tasks, isLoading: false })
    })

    // 求职模块额外获取漏斗
    if (key === 'jobseeker') {
      api.getStats('week').then(function (res) {
        if (res.funnel) ctx.setData({ funnel: res.funnel })
      })
    } else {
      ctx.setData({ funnel: null })
    }
  },

  // ========== 模块切换 ==========
  onModuleLabelTap() {
    this.setData({ showSheet: true })
  },

  onModuleSelect(e) {
    const key = e.currentTarget.dataset.key
    wx.setStorageSync('progressModule', key)
    this.setData({ currentModule: key, showSheet: false, isLoading: true })
    this.loadData()
  },

  closeSheet() { this.setData({ showSheet: false }) },

  // ========== 任务操作 ==========
  onComplete(e) {
    const id = e.currentTarget.dataset.id
    const idx = this.data.tasks.findIndex(function (t) { return t._id === id })
    if (idx === -1) return

    // 1. 立即从列表移除（0ms 反馈）
    var task = this.data.tasks[idx]
    var tasks = this.data.tasks.slice()
    tasks.splice(idx, 1)
    this.setData({ tasks: tasks })

    // 2. 后台 API
    var ctx = this
    api.completeAction(id).then(function (res) {
      wx.showToast({ title: phrases.pick(phrases.COMPLETE), icon: 'success', duration: 800 })

      if (res.sourceType === 'job' && res.jobInfo) {
        var statusMap = {
          '待投递': { next: '已投递', label: '已投递简历' },
          '已投递': { next: '面试中', label: '进入面试' },
          '面试中': { next: 'Offer',  label: '拿到 Offer' }
        }
        var option = statusMap[res.jobInfo.status]
        if (option) {
          wx.showModal({
            title: '同步更新状态？',
            content: '将「' + res.jobInfo.company + ' - ' + res.jobInfo.position + '」的状态更新为「' + option.label + '」？',
            confirmText: '是',
            cancelText: '否',
            success: function (modalRes) {
              if (modalRes.confirm) {
                api.updateJobStatus({ jobId: res.jobInfo._id, newStatus: option.next })
              }
              app.markDirty(['today', 'progress', 'mine'])
            }
          })
          return
        }
      }
      app.markDirty(['today', 'progress', 'mine'])
    }).catch(function () {
      wx.showToast({ title: '操作失败，请重试', icon: 'none' })
      var restored = ctx.data.tasks.slice()
      restored.splice(idx, 0, task)
      ctx.setData({ tasks: restored })
    })
  },

  // ========== 工具箱 ==========
  onDailyLimitChange(e) {
    var limit = e.detail.value
    var ctx = this
    this.setData({ dailyLimit: limit })
    if (ctx._limitTimer) clearTimeout(ctx._limitTimer)
    ctx._limitTimer = setTimeout(function () {
      api.updatePreference({ dailyLimit: limit }).then(function (res) {
        if (res.success) {
          wx.showToast({ title: '每日求职推荐上限已设为 ' + limit + ' 条', icon: 'success' })
          app.markDirty(['today', 'progress'])
        } else {
          wx.showToast({ title: res.errMsg || '设置失败', icon: 'none' })
        }
      })
    }, 300)
  },

  onGoJobs() {
    wx.navigateTo({ url: '/pages/jobs/jobs' })
  },

  onGoTasks() {
    wx.navigateTo({ url: '/pages/tasks/tasks' })
  },

  // ========== 导航 ==========
  onBack() {
    wx.switchTab({ url: '/pages/today/today' })
  },

  onAddTask() {
    wx.setStorageSync('createPreSelect', this.data.currentModule)
    wx.switchTab({ url: '/pages/create/create' })
  }
})
