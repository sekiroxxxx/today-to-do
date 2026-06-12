// 任务管理 v1.1 — 批量管理工具
const api = require('../../utils/api')
const app = getApp()

Page({
  data: {
    tasks: [],
    sections: [],           // [{ level, label, dotClass, tasks }]
    highTasks: [],
    midTasks: [],
    lowTasks: [],
    disabledTasks: [],
    currentModule: '',      // 从 URL 参数读取，用于模块过滤
    filter: 'active',
    loading: true,
    showActionSheet: false,
    selectedTask: null,
    actionItems: []
  },

  onLoad(options) {
    if (options && options.module) {
      this.setData({ currentModule: options.module })
    }
  },

  onShow() {
    if (!app.globalData.dirty.tasks && this.data.tasks.length > 0) return

    var hasData = this.data.tasks.length > 0
    this.loadTasks(!hasData)
  },

  loadTasks(showLoading) {
    if (showLoading) {
      this.setData({ loading: true })
    }

    var ctx = this
    var filter = {}
    if (ctx.data.currentModule) {
      filter.module = ctx.data.currentModule
    }

    api.getTaskList(filter).then(function (taskRes) {
      var tasks = (taskRes.tasks || []).map(function (t) { return ctx.addTagLine(t) })

      var active = tasks.filter(function (t) { return t.enabled })
      var high = active.filter(function (t) { return t.priority === 1 })
      var mid  = active.filter(function (t) { return t.priority === 2 })
      var low  = active.filter(function (t) { return t.priority === 3 })

      var sections = []
      if (high.length) sections.push({ level: 'high', label: '高优先级', dotClass: 'pri-dot--high', tasks: high })
      if (mid.length)  sections.push({ level: 'mid', label: '中优先级', dotClass: 'pri-dot--mid', tasks: mid })
      if (low.length)  sections.push({ level: 'low', label: '低优先级', dotClass: 'pri-dot--low', tasks: low })

      ctx.setData({
        tasks: tasks, sections: sections,
        highTasks: high, midTasks: mid, lowTasks: low,
        disabledTasks: tasks.filter(function (t) { return !t.enabled })
      })
      app.globalData.dirty.tasks = false
    }).catch(function () {
      app.globalData.dirty.tasks = false
    }).finally(function () {
      ctx.setData({ loading: false })
    })
  },

  // 计算第二行标签文本（纯 · 分隔）
  addTagLine(task) {
    var parts = []
    if (task.estimatedMinutes) parts.push(task.estimatedMinutes + '分钟')
    if (task.repeatRule && task.repeatRule.type !== 'none') {
      parts.push(task.repeatRule.type === 'daily' ? '每天' : '每周' + task.repeatRule.daysOfWeek.length + '天')
    }
    if (task.postponeCount >= 3) parts.push('已推迟' + task.postponeCount + '次')
    task.tagLine = parts.join(' · ')
    return task
  },

  // ========== 导航 ==========
  onFilterSwitch(e) {
    this.setData({ filter: e.currentTarget.dataset.filter })
  },

  onAdd() {
    var module = this.data.currentModule || 'custom'
    wx.navigateTo({ url: '/pages/form/form?mode=create&module=' + module })
  },

  onEdit(e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/form/form?mode=edit&type=task&id=' + id })
  },

  // ========== 长按操作 ==========
  onLongPress(e) {
    var dataset = e.currentTarget.dataset
    var task = this.data.tasks.find(function (t) { return t._id === dataset.id })
    if (!task) return

    var actionItems = [
      { label: '编辑', value: 'edit' },
      { label: task.enabled ? '禁用' : '启用', value: 'toggle' },
      { label: '删除', value: 'delete', highlight: true }
    ]

    this.setData({
      showActionSheet: true,
      selectedTask: task,
      actionItems: actionItems
    })
  },

  onSheetClose() {
    this.setData({ showActionSheet: false })
  },

  onActionSelect(e) {
    var item = e.detail.item
    var task = this.data.selectedTask
    this.setData({ showActionSheet: false })

    var ctx = this
    switch (item.value) {
      case 'edit':
        wx.navigateTo({ url: '/pages/form/form?mode=edit&type=task&id=' + task._id })
        break
      case 'toggle':
        api.updateTask({
          taskId: task._id,
          enabled: !task.enabled
        }).then(function (res) {
          if (res.success) {
            app.markDirty(['today', 'mine', 'progress'])
            wx.showToast({ title: task.enabled ? '已禁用' : '已启用', icon: 'success' })
            ctx.loadTasks()
          } else {
            wx.showToast({ title: res.errMsg, icon: 'none' })
          }
        })
        break
      case 'delete':
        wx.showModal({
          title: '删除任务',
          content: '确定删除「' + task.title + '」吗？',
          confirmColor: '#FF4D4F',
          success: function (res) {
            if (res.confirm) {
              api.deleteTask(task._id).then(function (result) {
                if (result.success) {
                  app.markDirty(['today', 'mine', 'progress'])
                  wx.showToast({ title: '已删除', icon: 'success' })
                  // 本地 splice
                  var tasks = ctx.data.tasks.filter(function (t) { return t._id !== task._id })
                  var active = tasks.filter(function (t) { return t.enabled })
                  var high = active.filter(function (t) { return t.priority === 1 })
                  var mid  = active.filter(function (t) { return t.priority === 2 })
                  var low  = active.filter(function (t) { return t.priority === 3 })
                  var sections = []
                  if (high.length) sections.push({ level: 'high', label: '高优先级', dotClass: 'pri-dot--high', tasks: high })
                  if (mid.length)  sections.push({ level: 'mid',  label: '中优先级', dotClass: 'pri-dot--mid',  tasks: mid })
                  if (low.length)  sections.push({ level: 'low',  label: '低优先级', dotClass: 'pri-dot--low',  tasks: low })
                  ctx.setData({
                    tasks: tasks, sections: sections,
                    highTasks: high, midTasks: mid, lowTasks: low,
                    disabledTasks: tasks.filter(function (t) { return !t.enabled })
                  })
                }
              })
            }
          }
        })
        break
    }
  }
})
