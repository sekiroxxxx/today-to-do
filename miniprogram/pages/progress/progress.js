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
    funnel: null,      // 求职漏斗
    showSheet: false
  },

  onShow() {
    var userModules = (app.globalData.userInfo && app.globalData.userInfo.modules) || ['jobseeker', 'custom']
    var enabled = phrases.MODULES.filter(function (m) { return userModules.indexOf(m.key) > -1 })
    this.setData({ modules: enabled })
    if (!this.data.currentModuleInfo) {
      this.setData({ currentModuleInfo: enabled[0] || null })
    }
    if (!app.globalData.dirty.progress) return
    this.loadData()
  },

  loadData() {
    const mod = phrases.MODULES.find(m => m.key === this.data.currentModule)
    if (mod) wx.setNavigationBarTitle({ title: mod.name })

    app.globalData.dirty.progress = false

    // 更新当前模块信息
    const currentModuleInfo = phrases.MODULES.find(m => m.key === this.data.currentModule)
    this.setData({ currentModuleInfo })

    // 获取该模块的今日任务，求职加评级 badge
    api.getTodayActions().then(res => {
      const tasks = (res.actions || []).filter(a => a.module === this.data.currentModule)
        .map(a => {
          if (a.sourceType === 'job' && a.normalizedScore != null) {
            const tier = phrases.RATING_TIERS.find(t => a.normalizedScore >= t.min) || phrases.RATING_TIERS[phrases.RATING_TIERS.length - 1]
            a.badge = tier
          }
          return a
        })
      this.setData({ tasks })
    })

    // 求职模块额外获取漏斗
    if (this.data.currentModule === 'jobseeker') {
      api.getStats('week').then(res => {
        if (res.funnel) this.setData({ funnel: res.funnel })
      })
    } else {
      this.setData({ funnel: null })
    }
  },

  // ========== 模块切换 ==========
  onModuleLabelTap() {
    this.setData({ showSheet: true })
  },

  onModuleSelect(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ currentModule: key, showSheet: false })
    this.loadData()
  },

  closeSheet() { this.setData({ showSheet: false }) },

  // ========== 任务操作 ==========
  onComplete(e) {
    const id = e.currentTarget.dataset.id
    var ctx = this
    api.completeAction(id).then(function (res) {
      wx.showToast({ title: phrases.pick(phrases.COMPLETE), icon: 'success' })
      // 求职任务：询问是否推进状态
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
              ctx.loadData()
            }
          })
          return
        }
      }
      app.markDirty(['today', 'progress', 'mine'])
      ctx.loadData()
    })
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
