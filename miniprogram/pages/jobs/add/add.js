// 添加/编辑求职岗位
const api = require('../../../utils/api')

Page({
  data: {
    isEdit: false,          // 是否编辑模式
    jobId: '',              // 编辑时传入的 _id
    form: {
      company: '',
      position: '',
      salaryRange: '',
      applyLink: '',
      deadline: '',
      attractionScore: 3,
      preparednessScore: 1
    },
    saving: false
  },

  onLoad(options) {
    // 如果有 id 参数，说明是编辑模式
    if (options.id) {
      this.setData({ isEdit: true, jobId: options.id })
      this.loadJob(options.id)
    }
  },

  // 加载已有岗位数据
  loadJob(id) {
    api.getJobList().then(res => {
      const job = (res.jobs || []).find(j => j._id === id)
      if (job) {
        this.setData({
          form: {
            company: job.company || '',
            position: job.position || '',
            salaryRange: job.salaryRange || '',
            applyLink: job.applyLink || '',
            deadline: job.deadline || '',
            attractionScore: job.attractionScore || 3,
            preparednessScore: job.preparednessScore || 1
          }
        })
        wx.setNavigationBarTitle({ title: '编辑岗位' })
      }
    })
  },

  // ========== 表单绑定 ==========
  onInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [`form.${field}`]: e.detail.value })
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

  // ========== 提交 ==========
  onSubmit() {
    const { form } = this.data
    // 校验必填
    if (!form.company.trim()) return wx.showToast({ title: '请输入公司名称', icon: 'none' })
    if (!form.position.trim()) return wx.showToast({ title: '请输入岗位名称', icon: 'none' })

    this.setData({ saving: true })

    const data = {
      company: form.company.trim(),
      position: form.position.trim(),
      salaryRange: form.salaryRange.trim(),
      applyLink: form.applyLink.trim(),
      deadline: form.deadline,
      attractionScore: form.attractionScore,
      preparednessScore: form.preparednessScore
    }

    const action = this.data.isEdit
      ? api.updateJob({ jobId: this.data.jobId, ...data })
      : api.addJob(data)

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
