// 推进 Tab v1.1 — 模块工作区（组件家族版）
const api = require('../../utils/api')
const phrases = require('../../utils/phrases')
const app = getApp()

// 推进按钮文案映射（预计算，避免 WXML 中括号访问）
function getToolLabel(status) {
  var map = {
    '待投递': '投了',
    '已投递': '面试',
    '面试中': 'Offer'
  }
  return map[status] || ''
}

Page({
  data: {
    modules: [],
    currentModule: 'jobseeker',
    currentModuleInfo: null,
    activeTasks: [],
    completedTasks: [],
    funnel: null,
    showSheet: false,
    showHistory: false,
    isLoading: false,
    dailyLimit: 5
  },

  onShow() {
    var userModules = (app.globalData.userInfo && app.globalData.userInfo.modules) || ['jobseeker', 'custom']
    var enabled = phrases.MODULES.filter(function (m) { return userModules.indexOf(m.key) > -1 })

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

    if (!app.globalData.dirty.progress) {
      this.loadData(activeModule, true)
      return
    }
    // dirty=true：延迟 500ms 给云 DB 副本同步留时间
    var ctx = this
    setTimeout(function () { ctx.loadData(activeModule) }, 500)
  },

  loadData(moduleKey, silent) {
    var key = moduleKey || this.data.currentModule
    var mod = phrases.MODULES.find(function (m) { return m.key === key })
    if (mod) wx.setNavigationBarTitle({ title: mod.name })

    app.globalData.dirty.progress = false

    var info = phrases.MODULES.find(function (m) { return m.key === key })
    var dailyLimit = (app.globalData.userInfo && app.globalData.userInfo.preferences && app.globalData.userInfo.preferences.dailyLimit) || 5
    var setDataObj = { currentModuleInfo: info, dailyLimit: dailyLimit }
    if (!silent) setDataObj.showHistory = false
    this.setData(setDataObj)

    var ctx = this

    // 并行请求：今日清单 + 模块数据源
    var actionPromise = api.getTodayActions()
    var enrichPromise

    if (key === 'jobseeker') {
      enrichPromise = api.getJobList().then(function (res) {
        return { type: 'jobs', data: res.jobs || [] }
      })
      // 异步获取漏斗
      api.getStats('week').then(function (res) {
        if (res.funnel) ctx.setData({ funnel: res.funnel })
      })
    } else {
      enrichPromise = api.getTaskList({ module: key }).then(function (res) {
        return { type: 'tasks', data: res.tasks || [] }
      })
    }

    Promise.all([actionPromise, enrichPromise]).then(function (results) {
      var actionRes = results[0]
      var enrichRes = results[1]

      // 按模块过滤
      var moduleActions = (actionRes.actions || []).filter(function (a) {
        return a.module === key
      })

      // 交叉匹配富化
      var enriched = moduleActions.map(function (action) {
        if (enrichRes.type === 'jobs') {
          var job = (enrichRes.data || []).find(function (j) { return j._id === action.sourceId })
          if (job) {
            action.jobInfo = job
            action.toolLabel = getToolLabel(job.status)
          }
          if (action.normalizedScore != null) {
            var tier = phrases.RATING_TIERS.filter(function (t) { return action.normalizedScore >= t.min })[0] || phrases.RATING_TIERS[phrases.RATING_TIERS.length - 1]
            action.badge = tier
          }
        } else {
          var task = (enrichRes.data || []).find(function (t) { return t._id === action.sourceId })
          if (task) {
            action.taskInfo = task
          }
        }
        return action
      })

      // 拆分：进行中 / 已完成
      var active = enriched.filter(function (a) { return !a.completed })
      var completed = enriched.filter(function (a) { return a.completed })

      ctx.setData({
        activeTasks: active,
        completedTasks: completed,
        isLoading: false
      })
    }).catch(function () {
      ctx.setData({ isLoading: false })
    })

    // 非求职模块清空漏斗
    if (key !== 'jobseeker') {
      this.setData({ funnel: null })
    }
  },

  // ========== 卡片事件 ==========

  // 完成
  onCardComplete(e) {
    var actionId = e.detail.actionId
    var idx = this.data.activeTasks.findIndex(function (t) { return t._id === actionId })
    if (idx === -1) return

    var action = this.data.activeTasks[idx]
    var active = this.data.activeTasks.slice()
    active.splice(idx, 1)

    // 移入已完成列表
    action.completed = true
    var completed = [action].concat(this.data.completedTasks || [])
    this.setData({ activeTasks: active, completedTasks: completed })

    var ctx = this
    api.completeAction(actionId).then(function (res) {
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
              app.markDirty(['today', 'mine', 'tasks'])
            }
          })
          return
        }
      }
      app.markDirty(['today', 'mine', 'tasks'])
    }).catch(function () {
      wx.showToast({ title: '操作失败，请重试', icon: 'none' })
      // 恢复
      var restoredActive = ctx.data.activeTasks.slice()
      restoredActive.splice(idx, 0, action)
      var restoredCompleted = (ctx.data.completedTasks || []).filter(function (t) { return t._id !== actionId })
      ctx.setData({ activeTasks: restoredActive, completedTasks: restoredCompleted })
    })
  },

  // 编辑（仅 card-default）
  onCardEdit(e) {
    wx.navigateTo({ url: '/pages/form/form?mode=edit&type=task&id=' + e.detail.sourceId })
  },

  // 推进（仅 card-jobseeker）
  onCardTool(e) {
    var detail = e.detail
    var statusMap = {
      '待投递': { next: '已投递', label: '已投递简历' },
      '已投递': { next: '面试中', label: '进入面试' },
      '面试中': { next: 'Offer',  label: '拿到 Offer' }
    }
    var option = statusMap[detail.currentStatus]
    if (!option) return

    var ctx = this
    wx.showModal({
      title: '同步更新状态？',
      content: '将状态更新为「' + option.label + '」？',
      confirmText: '是',
      cancelText: '否',
      success: function (modalRes) {
        if (modalRes.confirm) {
          api.updateJobStatus({ jobId: detail.jobId, newStatus: option.next }).then(function () {
            app.markDirty(['today', 'mine', 'tasks'])
            ctx.loadData()
          })
        }
      }
    })
  },

  // 点击求职卡片 → 岗位详情
  onCardNav(e) {
    wx.navigateTo({ url: '/pages/jobs/detail/detail?id=' + e.detail.jobId })
  },

  // ========== 已完成面板 ==========
  toggleHistory() {
    this.setData({ showHistory: !this.data.showHistory })
  },

  // "再做一次"（已完成面板中 card-default 的操作）
  onRedo(e) {
    var actionId = e.currentTarget.dataset.id
    var sourceId = e.currentTarget.dataset.source
    var ctx = this
    wx.showModal({
      title: '再做一次',
      content: '该任务将重新出现在今日清单中',
      success: function (res) {
        if (res.confirm) {
          api.updateTask({ taskId: sourceId }).then(function (result) {
            if (result.success) {
              wx.showToast({ title: '已重新加入今日清单', icon: 'success' })
              app.markDirty(['today', 'mine', 'tasks'])
              ctx.loadData()
            } else {
              wx.showToast({ title: result.errMsg || '操作失败', icon: 'none' })
            }
          })
        }
      }
    })
  },

  // "删除"（已完成面板中 card-default 的操作）
  onDeleteCompleted(e) {
    var actionId = e.currentTarget.dataset.id
    var sourceId = e.currentTarget.dataset.source
    var ctx = this
    wx.showModal({
      title: '删除任务',
      content: '确定删除该任务吗？',
      confirmColor: '#FF4D4F',
      success: function (res) {
        if (res.confirm) {
          api.deleteTask(sourceId).then(function (result) {
            if (result.success) {
              wx.showToast({ title: '已删除', icon: 'success' })
              app.markDirty(['today', 'mine', 'tasks'])
              // 本地移除
              var completed = ctx.data.completedTasks.filter(function (t) { return t._id !== actionId })
              ctx.setData({ completedTasks: completed })
            } else {
              wx.showToast({ title: result.errMsg || '删除失败', icon: 'none' })
            }
          })
        }
      }
    })
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
          app.markDirty(['today'])
          // 强制重新生成今日清单以应用新 limit
          api.generateDailyActions(true).then(function () {
            ctx.loadData()
          })
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
    wx.navigateTo({ url: '/pages/tasks/tasks?module=' + this.data.currentModule })
  },

  // ========== 导航 ==========
  onBack() {
    wx.switchTab({ url: '/pages/today/today' })
  },

  onAddTask() {
    wx.navigateTo({ url: '/pages/form/form?mode=create&module=' + this.data.currentModule })
  }
})
