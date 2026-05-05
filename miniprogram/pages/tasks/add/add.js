// 添加/编辑自定义任务
const api = require('../../../utils/api')

// 节流：防止连点重复提交。2 秒内仅执行第一次
let lastSubmitTime = 0
const SUBMIT_GAP = 2000

Page({
  data: {
    isEdit: false,
    taskId: '',
    form: {
      title: '',
      note: '',
      priority: 2,          // 1=高, 2=中, 3=低
      estimatedMinutes: '',
      deadline: '',
      repeatType: 'none',   // 'none' | 'daily' | 'weekly'
      repeatDays: []        // [1,3,5] 周一三五
    },
    // 星期几选择器
    weekdays: [
      { value: 1, label: '一' },
      { value: 2, label: '二' },
      { value: 3, label: '三' },
      { value: 4, label: '四' },
      { value: 5, label: '五' },
      { value: 6, label: '六' },
      { value: 7, label: '日' }
    ],
    saving: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ isEdit: true, taskId: options.id })
      this.loadTask(options.id)
    }
  },

  loadTask(id) {
    api.getTaskList().then(res => {
      const task = (res.tasks || []).find(t => t._id === id)
      if (task) {
        this.setData({
          form: {
            title: task.title || '',
            note: task.note || '',
            priority: task.priority || 2,
            estimatedMinutes: task.estimatedMinutes ? String(task.estimatedMinutes) : '',
            deadline: task.deadline || '',
            repeatType: (task.repeatRule && task.repeatRule.type) || 'none',
            repeatDays: (task.repeatRule && task.repeatRule.daysOfWeek) || []
          }
        })
        wx.setNavigationBarTitle({ title: '编辑任务' })
      }
    })
  },

  // ========== 表单绑定 ==========
  onInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onPrioritySelect(e) {
    this.setData({ 'form.priority': Number(e.currentTarget.dataset.priority) })
  },

  onRepeatTypeSelect(e) {
    this.setData({ 'form.repeatType': e.currentTarget.dataset.type })
  },

  onWeekdayToggle(e) {
    const day = Number(e.currentTarget.dataset.day)
    let days = [...this.data.form.repeatDays]
    const idx = days.indexOf(day)
    if (idx > -1) {
      days.splice(idx, 1)       // 取消选中
    } else {
      days.push(day)            // 选中
    }
    days.sort((a, b) => a - b)
    this.setData({ 'form.repeatDays': days })
  },

  onDeadlineChange(e) {
    this.setData({ 'form.deadline': e.detail.value })
  },

  // ========== 提交 ==========
  onSubmit() {
    // 节流：2 秒内的重复点击直接丢弃
    const now = Date.now()
    if (now - lastSubmitTime < SUBMIT_GAP) return
    lastSubmitTime = now

    const { form } = this.data
    if (!form.title.trim()) {
      return wx.showToast({ title: '请输入任务标题', icon: 'none' })
    }
    // 每周重复必须选至少一天
    if (form.repeatType === 'weekly' && form.repeatDays.length === 0) {
      return wx.showToast({ title: '请选择至少一个星期几', icon: 'none' })
    }

    this.setData({ saving: true })

    const data = {
      title: form.title.trim(),
      note: form.note.trim(),
      priority: form.priority,
      estimatedMinutes: Number(form.estimatedMinutes) || 0,
      deadline: form.deadline,
      repeatRule: {
        type: form.repeatType,
        daysOfWeek: form.repeatType === 'weekly' ? form.repeatDays : []
      }
    }

    const action = this.data.isEdit
      ? api.updateTask({ taskId: this.data.taskId, ...data })
      : api.addTask(data)

    action.then(res => {
      this.setData({ saving: false })
      if (res.success) {
        wx.showToast({ title: this.data.isEdit ? '已更新' : '已添加', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 1500)
      } else {
        wx.showToast({ title: res.errMsg || '操作失败', icon: 'none' })
      }
    }).catch(() => {
      this.setData({ saving: false })
    })
  }
})
