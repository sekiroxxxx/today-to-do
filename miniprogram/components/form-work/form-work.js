// form-work：work 模块表单
Component({
  properties: {
    initialData: { type: Object, value: {} },
    mode:        { type: String, value: 'create' }
  },

  data: {
    form: {
      title: '',
      projectName: '',
      deadline: '',
      priority: 2
    },
    today: '',
    submitting: false
  },

  lifetimes: {
    attached() {
      this.setData({ today: getDateString(new Date()) })
      var init = this.properties.initialData || {}
      if (init.title || init.projectName || init.priority) {
        this.setData({
          form: {
            title: init.title || '',
            projectName: init.projectName || init.note || '',
            deadline: init.deadline || '',
            priority: init.priority || 2
          }
        })
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

    onDeadlineChange(e) {
      this.setData({ 'form.deadline': e.detail.value })
    },

    onSubmit() {
      var form = this.data.form
      if (!form.title.trim()) {
        wx.showToast({ title: '请输入任务标题', icon: 'none' })
        return
      }

      this.setData({ submitting: true })
      this.triggerEvent('submit', {
        formData: {
          title: form.title.trim(),
          note: form.projectName.trim(),
          priority: form.priority,
          deadline: form.deadline
        }
      })
    },

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
