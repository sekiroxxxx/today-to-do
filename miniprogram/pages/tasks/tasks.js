// 任务管理 — 自定义任务列表
const api = require('../../utils/api')

Page({
  data: {
    tasks: [],              // 全部任务
    highTasks: [],          // 高优先级
    midTasks: [],           // 中优先级
    lowTasks: [],           // 低优先级
    disabledTasks: [],      // 已禁用的任务
    filter: 'active',       // 'active' | 'disabled'
    loading: true,
    // 长按操作弹窗
    showActionSheet: false,
    selectedTask: null,
    actionItems: [
      { label: '编辑', value: 'edit' },
      { label: '禁用', value: 'toggle' },
      { label: '删除', value: 'delete', highlight: true }
    ]
  },

  onShow() {
    // 已有数据 → 静默刷新；首次加载 → 显示加载态
    const hasData = this.data.tasks.length > 0
    this.loadTasks(!hasData)
  },

  loadTasks(showLoading = false) {
    if (showLoading) {
      this.setData({ loading: true })
    }
    api.getTaskList().then(res => {
      const tasks = res.tasks || []
      const active = tasks.filter(t => t.enabled)
      this.setData({
        tasks,
        highTasks: active.filter(t => t.priority === 1),
        midTasks: active.filter(t => t.priority === 2),
        lowTasks: active.filter(t => t.priority === 3),
        disabledTasks: tasks.filter(t => !t.enabled),
        loading: false
      })
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
              api.deleteTask(task._id).then(result => {
                if (result.success) {
                  wx.showToast({ title: '已删除', icon: 'success' })
                  this.loadTasks()
                }
              })
            }
          }
        })
        break
    }
  }
})
