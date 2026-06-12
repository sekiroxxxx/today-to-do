// 任务管理 — 自定义任务列表
const api = require('../../utils/api')
const app = getApp()

Page({
  data: {
    tasks: [],
    sections: [],           // [{ level, label, dotClass, tasks }]
    highTasks: [],          // 保留用于空状态判断
    midTasks: [],
    lowTasks: [],
    disabledTasks: [],
    completedTasks: [],
    filter: 'active',
    loading: true,
    showActionSheet: false,
    selectedTask: null,
    actionItems: [
      { label: '编辑', value: 'edit' },
      { label: '禁用', value: 'toggle' },
      { label: '删除', value: 'delete', highlight: true }
    ]
  },

  onShow() {
    // 无数据时必须加载（navigateTo 每次新建实例，初始数据为空）
    if (!app.globalData.dirty.tasks && this.data.tasks.length > 0) return

    const hasData = this.data.tasks.length > 0
    this.loadTasks(!hasData)
  },

  loadTasks(showLoading = false) {
    if (showLoading) {
      this.setData({ loading: true })
    }
    var ctx = this
    // getTodayActions 可能因今日未生成清单而返回空，不作为致命错误
    var todayPromise = api.getTodayActions().catch(function () { return { actions: [] } })
    Promise.all([api.getTaskList(), todayPromise]).then(function (results) {
      var taskRes = results[0]
      var todayRes = results[1]

      // 交叉匹配：今天完成的 action 对应的 task
      var completedSourceIds = (todayRes.actions || [])
        .filter(function (a) { return a.completed && a.sourceType !== 'job' })
        .map(function (a) { return a.sourceId })

      var tasks = (taskRes.tasks || []).map(function (t) { return ctx.addTagLine(t) })

      var active = tasks.filter(function (t) {
        return t.enabled && completedSourceIds.indexOf(t._id) === -1
      })
      var high = active.filter(function (t) { return t.priority === 1 })
      var mid  = active.filter(function (t) { return t.priority === 2 })
      var low  = active.filter(function (t) { return t.priority === 3 })

      var sections = []
      if (high.length) sections.push({ level: 'high', label: '高优先级', dotClass: 'pri-dot--high', tasks: high })
      if (mid.length)  sections.push({ level: 'mid',  label: '中优先级', dotClass: 'pri-dot--mid',  tasks: mid })
      if (low.length)  sections.push({ level: 'low',  label: '低优先级', dotClass: 'pri-dot--low',  tasks: low })

      var completedTasks = tasks.filter(function (t) {
        return completedSourceIds.indexOf(t._id) > -1
      })

      ctx.setData({
        tasks: tasks, sections: sections,
        highTasks: high, midTasks: mid, lowTasks: low,
        disabledTasks: tasks.filter(function (t) { return !t.enabled }),
        completedTasks: completedTasks
      })
      app.globalData.dirty.tasks = false
    }).catch(function () {
      app.globalData.dirty.tasks = false
    }).finally(function () {
      ctx.setData({ loading: false })
    })
  },

  // 计算第二行标签文本（纯 · 分隔，无 emoji）
  addTagLine(task) {
    const parts = []
    if (task.estimatedMinutes) parts.push(`${task.estimatedMinutes}分钟`)
    if (task.repeatRule && task.repeatRule.type !== 'none') {
      parts.push(task.repeatRule.type === 'daily' ? '每天' : `每周${task.repeatRule.daysOfWeek.length}天`)
    }
    if (task.postponeCount >= 3) parts.push(`已推迟${task.postponeCount}次`)
    task.tagLine = parts.join(' · ')
    return task
  },

  // ========== 已完成操作 ==========
  onRedo(e) {
    var id = e.currentTarget.dataset.id
    var ctx = this
    wx.showModal({
      title: '再做一次',
      content: '该任务将重新出现在今日清单中',
      success: function (res) {
        if (res.confirm) {
          api.updateTask({ taskId: id }).then(function (result) {
            if (result.success) {
              wx.showToast({ title: '已重新加入今日清单', icon: 'success' })
              app.markDirty(['today', 'progress'])
              ctx.loadTasks()
            } else {
              wx.showToast({ title: result.errMsg || '操作失败', icon: 'none' })
            }
          })
        }
      }
    })
  },

  onDeleteCompleted(e) {
    var id = e.currentTarget.dataset.id
    var task = this.data.completedTasks.find(function (t) { return t._id === id })
    var title = task ? task.title : '此任务'
    var ctx = this
    wx.showModal({
      title: '删除任务',
      content: '确定删除「' + title + '」吗？',
      confirmColor: '#FF4D4F',
      success: function (res) {
        if (res.confirm) {
          api.deleteTask(id).then(function (result) {
            if (result.success) {
              wx.showToast({ title: '已删除', icon: 'success' })
              app.markDirty(['today', 'mine'])
              ctx.loadTasks()
            } else {
              wx.showToast({ title: result.errMsg || '删除失败', icon: 'none' })
            }
          })
        }
      }
    })
  },

  // ========== 导航 ==========
  onFilterSwitch(e) {
    this.setData({ filter: e.currentTarget.dataset.filter })
  },

  onAdd() {
    wx.navigateTo({ url: '/pages/tasks/add/add' })
  },

  onEdit(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/tasks/add/add?id=${id}` })
  },

  // ========== 长按操作 ==========
  onLongPress(e) {
    const { id, enabled } = e.currentTarget.dataset
    const task = this.data.tasks.find(t => t._id === id)
    if (!task) return

    const actionItems = [
      { label: '编辑', value: 'edit' },
      { label: enabled ? '禁用' : '启用', value: 'toggle' },
      { label: '删除', value: 'delete', highlight: true }
    ]

    this.setData({
      showActionSheet: true,
      selectedTask: task,
      actionItems
    })
  },

  onSheetClose() {
    this.setData({ showActionSheet: false })
  },

  onActionSelect(e) {
    const { item } = e.detail
    const task = this.data.selectedTask
    this.setData({ showActionSheet: false })

    switch (item.value) {
      case 'edit':
        wx.navigateTo({ url: `/pages/tasks/add/add?id=${task._id}` })
        break
      case 'toggle':
        api.updateTask({
          taskId: task._id,
          enabled: !task.enabled
        }).then(res => {
          if (res.success) {
            app.markDirty(['today', 'mine'])
            wx.showToast({ title: task.enabled ? '已禁用' : '已启用', icon: 'success' })
            this.loadTasks()
          } else {
            wx.showToast({ title: res.errMsg, icon: 'none' })
          }
        })
        break
      case 'delete':
        wx.showModal({
          title: '删除任务',
          content: `确定删除「${task.title}」吗？`,
          confirmColor: '#FF4D4F',
          success: (res) => {
            if (res.confirm) {
              var that = this
          api.deleteTask(task._id).then(function (result) {
                if (result.success) {
                  app.markDirty(['today', 'mine'])
                  wx.showToast({ title: '已删除', icon: 'success' })
                  // 本地 splice，不重拉全量
                  var tasks = that.data.tasks.filter(function (t) { return t._id !== task._id })
                  var active = tasks.filter(function (t) { return t.enabled })
                  var high = active.filter(function (t) { return t.priority === 1 })
                  var mid  = active.filter(function (t) { return t.priority === 2 })
                  var low  = active.filter(function (t) { return t.priority === 3 })
                  var sections = []
                  if (high.length) sections.push({ level: 'high', label: '高优先级', dotClass: 'pri-dot--high', tasks: high })
                  if (mid.length)  sections.push({ level: 'mid',  label: '中优先级', dotClass: 'pri-dot--mid',  tasks: mid })
                  if (low.length)  sections.push({ level: 'low',  label: '低优先级', dotClass: 'pri-dot--low',  tasks: low })
                  that.setData({
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
