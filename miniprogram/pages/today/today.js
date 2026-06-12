const api = require('../../utils/api')
const app = getApp()
const phrases = require('../../utils/phrases')
const algorithm = require('../../utils/algorithm')

let dismissedSourceIds = []
let isRefreshing = false

Page({
  data: {
    modules: [],               // [{ key, icon, name, color, actions, open, count }]
    loading: true,
    empty: false,
    allDone: false,
    todayGenerated: false,
    todayDate: '',
    isOffline: false,
    allModulesDone: false
  },

  onShow() {
    this.setData({ isOffline: app.globalData.isOffline || false })
    // 读本地缓存（断网兜底）
    const cache = wx.getStorageSync('dailyCache')
    if (!this.data.modules.length && cache && cache.date === getDateString(new Date())) {
      this.setData({ modules: cache.modules, todayDate: cache.date, loading: false })
    }

    if (!app.globalData.dirty.today) return

    // 模块切换：本地重建，不调云函数，避免闪烁
    if (app.globalData.dirtyReason.today === 'moduleChange' && this.data.modules.length > 0) {
      var flatActions = []
      this.data.modules.forEach(function (m) { flatActions = flatActions.concat(m.actions) })
      var rebuilt = this.buildModules(flatActions, this.data.todayGenerated)
      this.setData({ modules: rebuilt, loading: false })
      app.globalData.dirty.today = false
      delete app.globalData.dirtyReason.today
      // 如果开了新模块，后台静默刷新获取新模块数据
      this.loadTodayActions(false)
      return
    }

    const hasData = this.data.modules.length > 0
    this.loadTodayActions(!hasData)
  },

  loadTodayActions(showLoading = false) {
    if (showLoading) this.setData({ loading: true })
    const fetch = app.globalData.dirty.today
      ? api.generateDailyActions(true)
      : api.getTodayActions().then(res => {
          if (res.actions && res.actions.length > 0) return res
          return api.generateDailyActions().then(genRes => ({ actions: genRes.actions || [], date: genRes.date, generated: true }))
        })

    fetch.then(res => {
      const filtered = this.filterDismissed(res.actions || [])
      const generated = res.generated !== undefined && res.generated !== false
      const willBeGenerated = generated || this.data.todayGenerated
      // 传入 willBeGenerated 是因为 setData 还没执行，buildModules 读不到最新的 todayGenerated
      const modules = this.buildModules(filtered, willBeGenerated)
      const hasActions = modules.filter(function (m) { return !m.allDone }).length > 0
      var allModulesDone = willBeGenerated && modules.length > 0 && !hasActions

      this.setData({
        modules,
        empty: !hasActions && !willBeGenerated,
        allDone: !hasActions && willBeGenerated,
        allModulesDone: allModulesDone,
        todayGenerated: willBeGenerated,
        todayDate: res.date,
        loading: false
      })
      // 写缓存
      wx.setStorageSync('dailyCache', { date: res.date, modules })
    }).finally(() => { app.globalData.dirty.today = false })
  },

  // 按 module 分组，已完成模块也保留（allDone 标记）
  buildModules(actions, isGenerated) {
    var generated = arguments.length > 1 ? isGenerated : this.data.todayGenerated
    var userModules = (app.globalData.userInfo && app.globalData.userInfo.modules) || ['jobseeker', 'custom']
    var map = {}
    actions.forEach(function (a) {
      var m = a.module || (a.sourceType === 'job' ? 'jobseeker' : 'custom')
      if (!map[m]) map[m] = []
      map[m].push(a)
    })

    var result = []
    for (var i = 0; i < phrases.MODULES.length; i++) {
      var mod = phrases.MODULES[i]
      var enabled = userModules.indexOf(mod.key) > -1
      var hasActions = map[mod.key] && map[mod.key].length > 0
      if ((hasActions || generated) && enabled) {
        result.push({
          icon: mod.icon,
          name: mod.name,
          color: mod.color,
          key: mod.key,
          actions: map[mod.key] || [],
          open: hasActions,     // 有任务默认展开，完成了默认折叠
          count: hasActions ? map[mod.key].length : 0,
          allDone: !hasActions && generated
        })
      }
    }
    return result
  },

  onModuleToggle(e) {
    const key = e.currentTarget.dataset.key
    const modules = this.data.modules.map(m =>
      m.key === key ? Object.assign({}, m, { open: !m.open }) : m
    )
    this.setData({ modules })
  },

  onPullDownRefresh() {
    if (isRefreshing) { wx.stopPullDownRefresh(); return }
    isRefreshing = true
    wx.showNavigationBarLoading()

    const refresh = app.globalData.dirty.today
      ? api.generateDailyActions(true)
      : api.getTodayActions().then(res => ({ actions: res.actions || [] }))

    refresh.then(res => {
      const filtered = this.filterDismissed(res.actions || [])
      const modules = this.buildModules(filtered)
      this.setData({
        modules,
        empty: modules.length === 0,
        allDone: modules.length === 0,
        todayGenerated: true,
        todayDate: res.date || this.data.todayDate
      })
      app.globalData.dirty.today = false
      dismissedSourceIds = []
      wx.hideNavigationBarLoading()
      wx.stopPullDownRefresh()
      isRefreshing = false
    })
  },

  onComplete(e) {
    const id = e.currentTarget.dataset.id
    const target = this.findAction(id)
    if (!target) return

    // 1. 立即从 UI 移除（0ms 反馈）
    this.removeAction(id)

    // 2. 后台 API
    var ctx = this
    api.completeAction(id).then(function (res) {
      wx.showToast({ title: phrases.pick(phrases.COMPLETE), icon: 'success', duration: 800 })
      // 求职任务：完成 action 后询问是否推进岗位状态
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
      app.markDirty(['today', 'progress', 'mine'])
    })
  },

  onPostpone(e) {
    const id = e.currentTarget.dataset.id
    const type = e.currentTarget.dataset.type || 'skip'
    const target = this.findAction(id)
    if (!target) return

    // 调云函数标记推迟
    api.postponeAction(id, type).then(() => {
      this.removeAction(id)

      if (type === 'skip') {
        api.generateDailyActions(true).then(genRes => {
          const filtered = this.filterDismissed(genRes.actions || [])
          this.setData({ modules: this.buildModules(filtered) })
          app.globalData.dirty.today = false
        })
      }
      app.markDirty(['mine'])
    })
  },

  // 从模块列表中移除一张卡片（模块完成后保留，显示 ✓）
  removeAction(actionId) {
    const target = this.findAction(actionId)
    if (target && target.sourceId) dismissedSourceIds.push(target.sourceId)

    var generated = this.data.todayGenerated
    var ctx = this
    var modules = this.data.modules.map(function (m) {
      var remaining = m.actions.filter(function (a) { return a._id !== actionId })
      var allDone = remaining.length === 0 && generated
      return {
        icon: m.icon, name: m.name, color: m.color, key: m.key,
        open: allDone ? false : m.open,
        actions: remaining,
        count: remaining.length,
        allDone: allDone
      }
    })

    var hasActive = modules.filter(function (m) { return !m.allDone }).length > 0
    var allModulesDone = generated && modules.length > 0 && !hasActive
    this.setData({
      modules: modules,
      empty: modules.length === 0,
      allDone: !hasActive && generated,
      allModulesDone: allModulesDone
    })
  },

  findAction(id) {
    for (const m of this.data.modules) {
      const a = m.actions.find(a => a._id === id)
      if (a) return a
    }
    return null
  },

  onGoToCreate() { wx.switchTab({ url: '/pages/create/create' }) },

  // L4.5: 本地跑算法即时渲染，避免等云函数
  runLocalAlgorithm() {
    return Promise.all([api.getJobList(), api.getTaskList()]).then(([jobRes, taskRes]) => {
      const jobs = (jobRes.jobs || []).filter(j => j.status !== 'Offer' && j.status !== '已关闭')
      const tasks = (taskRes.tasks || []).filter(t => t.enabled)
      const result = algorithm.generateDailyList({ jobs, tasks, dailyLimit: 5 })
      return result.actions.map(a => ({
        sourceType: a.sourceType,
        sourceId: a.sourceId,
        title: a.title,
        description: a.description,
        normalizedScore: a.normalizedScore,
        rawScore: a.rawScore,
        createdAt: a.createdAt,
        module: a.sourceType === 'job' ? 'jobseeker' : ((tasks.find(function (t) { return t._id === a.sourceId }) || {}).module || 'custom')
      }))
    })
  },

  filterDismissed(actions) {
    return actions.filter(a => {
      if (a.completed || a.postponed) return false
      if (dismissedSourceIds.length > 0 && dismissedSourceIds.includes(a.sourceId)) return false
      return true
    })
  }
})

function getDateString(date) {
  var y = date.getFullYear()
  var m = String(date.getMonth() + 1)
  if (m.length === 1) m = '0' + m
  var d = String(date.getDate())
  if (d.length === 1) d = '0' + d
  return y + '-' + m + '-' + d
}
