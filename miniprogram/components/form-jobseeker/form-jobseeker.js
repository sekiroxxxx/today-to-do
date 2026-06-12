// form-jobseeker：求职模块表单
Component({
  properties: {
    initialData: { type: Object, value: {} },
    mode:        { type: String, value: 'create' }
  },

  data: {
    form: {
      company: '',
      position: '',
      salaryRange: '',
      applyLink: '',
      deadline: '',
      attractionScore: 3,
      preparednessScore: 1
    },
    today: '',
    submitting: false,
    scoreHints: {
      attraction: ['', '随便试试', '可以了解', '比较想去', '很感兴趣', '梦寐以求'],
      preparedness: ['', '刚收藏', '初步了解', '简历已适配', '针对准备', '内推已就绪']
    }
  },

  lifetimes: {
    attached() {
      this.setData({ today: getDateString(new Date()) })
      var init = this.properties.initialData || {}
      if (init.company || init.position) {
        this.setData({
          form: {
            company: init.company || '',
            position: init.position || '',
            salaryRange: init.salaryRange || '',
            applyLink: init.applyLink || '',
            deadline: init.deadline || '',
            attractionScore: init.attractionScore || 3,
            preparednessScore: init.preparednessScore || 1
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

    onAttractionChange(e) {
      this.setData({ 'form.attractionScore': e.detail.value })
    },

    onPreparednessChange(e) {
      this.setData({ 'form.preparednessScore': e.detail.value })
    },

    onDeadlineChange(e) {
      this.setData({ 'form.deadline': e.detail.value })
    },

    onSubmit() {
      var form = this.data.form
      if (!form.company.trim()) {
        wx.showToast({ title: '请输入公司名称', icon: 'none' })
        return
      }
      if (!form.position.trim()) {
        wx.showToast({ title: '请输入岗位名称', icon: 'none' })
        return
      }

      this.setData({ submitting: true })
      this.triggerEvent('submit', {
        formData: {
          company: form.company.trim(),
          position: form.position.trim(),
          salaryRange: form.salaryRange.trim(),
          applyLink: form.applyLink.trim(),
          deadline: form.deadline,
          attractionScore: form.attractionScore,
          preparednessScore: form.preparednessScore
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
