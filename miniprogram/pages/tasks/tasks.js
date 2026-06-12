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
    // 缓存干净直接跳过
    if (!app.globalData.dirty.tasks) return

    const hasData = this.data.tasks.length > 0
    this.loadTasks(!hasData)
  },

  loadTasks(showLoading = false) {
    if (showLoading) {
      this.setData({ loading: true })
    }
    api.getTaskList().then(res => {
      const tasks = (res.tasks || []).map(t => this.addTagLine(t))
      const active = tasks.filter(t => t.enabled)
      const high = active.filter(t => t.priority === 1)
      const mid  = active.filter(t => t.priority === 2)
      const low  = active.filter(t => t.priority === 3)

      const sections = []
      if (high.length) sections.push({ level: 'high', label: '高优先级', dotClass: 'pri-dot--high', tasks: high })
      if (mid.length)  sections.push({ level: 'mid',  label: '中优先级', dotClass: 'pri-dot--mid',  tasks: mid })
      if (low.length)  sections.push({ level: 'low',  label: '低优先级', dotClass: 'pri-dot--low',  tasks: low })

      this.setData({
        tasks, sections,
        highTasks: high, midTasks: mid, lowTasks: low,
        disabledTasks: tasks.filter(t => !t.enabled)
      })
      app.globalData.dirty.tasks = false
    }).catch(() => {
      app.globalData.dirty.tasks = false
    }).finally(() => {
      this.setData({ loading: false })
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
