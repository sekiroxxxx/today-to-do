// 推进 Tab v1.1 — 模块工作区（组件家族版）
const api = require('../../utils/api')
const tracked = require('../../utils/tracked')
const phrases = require('../../utils/phrases')
const app = getApp()
function dateStr(d) { var y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0'); return y + '-' + m + '-' + day }
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
    dailyLimit: 5,
    limitMin: 1,
    limitMax: 10,
    limitLabel: '每日推荐上限',
    showLimitSlider: true
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
    this.loadData(activeModule)
  },

  loadData(moduleKey, silent) {
    var key = moduleKey || this.data.currentModule
    var mod = phrases.MODULES.find(function (m) { return m.key === key })
    if (mod) wx.setNavigationBarTitle({ title: mod.name })

    app.globalData.dirty.progress = false
    var info = phrases.MODULES.find(function (m) { return m.key === key })
    var cfg = phrases.getModuleConfig(key, app.globalData.userInfo)
    var setDataObj = {
      currentModuleInfo: info,
      dailyLimit: cfg.dailyLimit,
      limitMin: cfg.limitRange[0],
      limitMax: cfg.limitRange[1],
      limitLabel: cfg.limitLabel,
      showLimitSlider: !!(cfg.limitRange && cfg.limitRange.length === 2)
    }
    if (!silent) setDataObj.showHistory = false
    this.setData(setDataObj)

    var ctx = this
    var todayStr = dateStr(new Date())

    if (key === 'jobseeker') {
      // jobseeker: 活跃=算法输出 + 富化，已完成=completed_log
      var actionPromise = api.getTodayActions()
      var enrichPromise = api.getJobList().then(function (res) { return res.jobs || [] })
      var logPromise = tracked.getCompletedLogs(todayStr, todayStr)
      // 异步漏斗
      api.getStats('week').then(function (res) { if (res.funnel) ctx.setData({ funnel: res.funnel }) })

      Promise.all([actionPromise, enrichPromise, logPromise]).then(function (results) {
        var actions = results[0].actions || []
        var jobs = results[1]
        var allLogs = (results[2].logs || []).filter(function (l) { return l.module === 'jobseeker' })

        // 活跃：算法输出的 jobseeker 模块 actions（未完成）
        var active = actions.filter(function (a) {
          return a.module === 'jobseeker' && !a.completed
        }).map(function (a) {
          var job = jobs.find(function (j) { return j._id === a.sourceId })
          if (job) {
            a.jobInfo = job
            a.toolLabel = getToolLabel(job.status)
            if (a.normalizedScore != null) {
              a.badge = phrases.RATING_TIERS.filter(function (t) { return a.normalizedScore >= t.min })[0] || phrases.RATING_TIERS[phrases.RATING_TIERS.length - 1]
            }
          }
          return a
        })

        // 已完成：completed_log 条目 + 交叉查 jobInfo
        var completed = allLogs.map(function (log) {
          var job = jobs.find(function (j) { return j._id === log.sourceId })
          return {
            _id: log._id,
            sourceId: log.sourceId,
            sourceType: 'job',
            title: (job ? job.company + ' - ' + job.position : log.title),
            description: '',
            jobInfo: job || null,
            completedAt: log.date
          }
        })

        ctx.setData({ activeTasks: active, completedTasks: completed, isLoading: false })
      }).catch(function () { ctx.setData({ isLoading: false }) })

    } else {
      // 非 jobseeker: 活跃=原始任务列表，已完成=completed_log
      var tPromise = api.getTaskList({ module: key }).then(function (res) { return res.tasks || [] })
      var lPromise = tracked.getCompletedLogs(todayStr, todayStr)
      this.setData({ funnel: null })

      Promise.all([tPromise, lPromise]).then(function (results) {
        var tasks = results[0]
        var allLogs = (results[1].logs || []).filter(function (l) { return l.module === key })
        // 今天已完成的 sourceId 集合
        var completedIds = {}
        allLogs.forEach(function (l) { completedIds[l.sourceId] = true })

        // 活跃 = 已启用且今天未完成的任务
        var active = tasks.filter(function (t) { return t.enabled && !completedIds[t._id] })
          .map(function (t) {
            return {
              _id: 'local_custom_' + t._id,
              sourceType: 'custom',
              sourceId: t._id,
              module: t.module || 'custom',
              title: t.title,
              description: t.note || '',
              taskInfo: t,
              normalizedScore: null,
              completed: false,
              postponed: false,
              date: todayStr
            }
          })

        // 已完成 = completed_log 条目 + 交叉查 task 数据
        var completed = allLogs.map(function (log) {
          var task = tasks.find(function (t) { return t._id === log.sourceId })
          return {
            _id: log._id,
            sourceId: log.sourceId,
            sourceType: 'custom',
            title: task ? task.title : log.title,
            description: task ? (task.note || '') : '',
            completedAt: log.date
          }
        })

        ctx.setData({ activeTasks: active, completedTasks: completed, isLoading: false })
      }).catch(function () { ctx.setData({ isLoading: false }) })
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
              app.markDirty(['today', 'progress', 'mine', 'tasks'])
            }
          })
          return
        }
      }
      app.markDirty(['today', 'progress', 'mine', 'tasks'])
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
          // 先本地更新状态（乐观UI）
          var active = ctx.data.activeTasks.map(function (a) {
            if (a.sourceId === detail.jobId && a.jobInfo) {
              var updated = Object.assign({}, a, {
                jobInfo: Object.assign({}, a.jobInfo, { status: option.next }),
                toolLabel: (function () {
                  var map = { '待投递': '投了', '已投递': '面试', '面试中': 'Offer' }
                  return map[option.next] || ''
                })()
              })
              return updated
            }
            return a
          })
          ctx.setData({ activeTasks: active })
          wx.showToast({ title: '已更新为' + option.label, icon: 'success' })
          // 后台 API
          api.updateJobStatus({ jobId: detail.jobId, newStatus: option.next }).then(function () {
            app.markDirty(['today', 'progress', 'mine', 'tasks'])
          }).catch(function () {
            wx.showToast({ title: '同步失败，请刷新', icon: 'none' })
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
              app.markDirty(['today', 'progress', 'mine', 'tasks'])
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
          // 先本地移除 + toast
          var completed = ctx.data.completedTasks.filter(function (t) { return t._id !== actionId })
          ctx.setData({ completedTasks: completed })
          wx.showToast({ title: '已删除', icon: 'success' })
          // 后台 API
          api.deleteTask(sourceId).then(function (result) {
            if (result.success) {
              app.markDirty(['today', 'progress', 'mine', 'tasks'])
            } else {
              wx.showToast({ title: result.errMsg || '删除失败', icon: 'none' })
              app.markDirty(['today', 'progress', 'mine', 'tasks'])
              ctx.loadData()
            }
          }).catch(function () {
            wx.showToast({ title: '网络异常，请刷新', icon: 'none' })
            ctx.loadData()
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
    var mod = this.data.currentModule
    var ctx = this
    this.setData({ dailyLimit: limit })
    if (ctx._limitTimer) clearTimeout(ctx._limitTimer)
    ctx._limitTimer = setTimeout(function () {
      api.updatePreference({ module: mod, dailyLimit: limit }).then(function (res) {
        if (res.success) {
          wx.showToast({ title: ctx.data.limitLabel + '已设为 ' + limit + ' 条', icon: 'success' })
          // 更新 app.globalData 中的用户值（下次 getModuleConfig 读到新值）
          if (!app.globalData.userInfo) app.globalData.userInfo = {}
          if (!app.globalData.userInfo.modulePrefs) app.globalData.userInfo.modulePrefs = {}
          if (!app.globalData.userInfo.modulePrefs[mod]) app.globalData.userInfo.modulePrefs[mod] = {}
          app.globalData.userInfo.modulePrefs[mod].dailyLimit = limit
          app.markDirty(['today', 'progress'])
          api.generateDailyActions(true).then(function () { ctx.loadData() })
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
