// form-custom：custom/study/freelance 模块表单
Component({
  properties: {
    initialData: { type: Object, value: {} },
    mode:        { type: String, value: 'create' }
  },

  data: {
    form: {
      title: '',
      note: '',
      priority: 2,
      estimatedMinutes: '',
      deadline: '',
      repeatType: 'none',
      repeatDays: []
    },
    weekdays: [
      { value: 1, label: '一', active: false },
      { value: 2, label: '二', active: false },
      { value: 3, label: '三', active: false },
      { value: 4, label: '四', active: false },
      { value: 5, label: '五', active: false },
      { value: 6, label: '六', active: false },
      { value: 7, label: '日', active: false }
    ],
    today: '',
    submitting: false
  },

  lifetimes: {
    attached() {
      this.setData({ today: getDateString(new Date()) })
      var init = this.properties.initialData || {}
      if (init.title || init.note || init.priority) {
        var days = init.repeatDays || (init.repeatRule && init.repeatRule.daysOfWeek) || []
        this.setData({
          form: {
            title: init.title || '',
            note: init.note || '',
            priority: init.priority || 2,
            estimatedMinutes: init.estimatedMinutes ? String(init.estimatedMinutes) : '',
            deadline: init.deadline || '',
            repeatType: (init.repeatRule && init.repeatRule.type) || init.repeatType || 'none',
            repeatDays: days
          }
        })
        this.syncWeekdayActive(days)
      }
    }
  },

  methods: {
    onInput(e) {
      var field = e.currentTarget.dataset.field
      var obj = {}
      obj['form.' + field] = e.detail.value
      this.setData(obj)
    },

    onPrioritySelect(e) {
      this.setData({ 'form.priority': Number(e.currentTarget.dataset.priority) })
    },

    onRepeatTypeSelect(e) {
      this.setData({ 'form.repeatType': e.currentTarget.dataset.type })
    },

    onWeekdayToggle(e) {
      var day = Number(e.currentTarget.dataset.day)
      var days = this.data.form.repeatDays.slice()
      var idx = days.indexOf(day)
      if (idx > -1) { days.splice(idx, 1) }
      else { days.push(day) }
      days.sort(function (a, b) { return a - b })
      this.setData({ 'form.repeatDays': days })
      this.syncWeekdayActive(days)
    },

    syncWeekdayActive(days) {
      var ctx = this
      var weekdays = this.data.weekdays.map(function (w) {
        return { value: w.value, label: w.label, active: days.indexOf(w.value) > -1 }
      })
      this.setData({ weekdays: weekdays })
    },

    onDeadlineChange(e) {
      this.setData({ 'form.deadline': e.detail.value })
    },

    onSubmit() {
      var form = this.data.form
      if (!form.title.trim()) {
        wx.showToast({ title: '请输入任务标题', icon: 'none' })
        return
      }
      if (form.repeatType === 'weekly' && (!form.repeatDays || form.repeatDays.length === 0)) {
        wx.showToast({ title: '请选择至少一个星期几', icon: 'none', duration: 2000 })
        return
      }

      this.setData({ submitting: true })
      this.triggerEvent('submit', {
        formData: {
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
      })
    },

    // 外部可调用，恢复按钮状态
    resetSubmitting() {
      this.setData({ submitting: false })
    },

    onCancel() {
      this.triggerEvent('cancel')
    }
  }
})

function getDateString(date) {
  var y = date.getFullYear()
  var m = String(date.getMonth() + 1).padStart(2, '0')
  var d = String(date.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + d
}
