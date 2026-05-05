// 岗位详情页
const api = require('../../../utils/api')
const app = getApp()

Page({
  data: {
    jobId: '',
    job: null,
    loading: true,
    // 状态推进弹窗
    showStatusSheet: false,
    statusItems: [],
    // 删除确认
    deleting: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ jobId: options.id })
    }
  },

  onShow() {
    if (this.data.jobId) this.loadJob()
  },

  // ========== 加载数据 ==========
  loadJob() {
    this.setData({ loading: true })
    api.getJobList().then(res => {
      const job = (res.jobs || []).find(j => j._id === this.data.jobId)
      if (job) {
        this.setData({ job, loading: false })
        wx.setNavigationBarTitle({ title: `${job.company} - ${job.position}` })
      } else {
        wx.showToast({ title: '岗位不存在', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 800)
      }
    })
  },

  // ========== 编辑 ==========
  onEdit() {
    wx.navigateTo({ url: `/pages/jobs/add/add?id=${this.data.jobId}` })
  },

  // ========== 状态推进 ==========
  onAdvanceStatus() {
    const { job } = this.data
    const transitions = {
      '待投递': [{ label: '已投递简历', value: '已投递', desc: '确认已完成投递' }],
      '已投递': [{ label: '进入面试', value: '面试中', desc: '收到面试邀请' }],
      '面试中': [{ label: '拿到 Offer', value: 'Offer', desc: '恭喜！' }]
    }
    const items = transitions[job.status] || []
    // 任何非终态都可以拒绝
    if (job.status !== 'Offer' && job.status !== '已拒绝') {
      items.push({ label: '放弃该岗位', value: '已拒绝', desc: '不再继续', highlight: true })
    }

    if (items.length === 0) {
      wx.showToast({ title: '当前状态已是终态', icon: 'none' })
      return
    }

    this.setData({ showStatusSheet: true, statusItems: items })
  },

  onStatusSelect(e) {
    const { item } = e.detail
    this.setData({ showStatusSheet: false })

    wx.showModal({
      title: '确认推进',
      content: `将状态改为「${item.label}」？`,
      success: (res) => {
        if (res.confirm) {
          api.updateJobStatus({
            jobId: this.data.jobId,
            newStatus: item.value
          }).then(result => {
            if (result.success) {
              app.markDirty(['jobs', 'today', 'mine'])
              wx.showToast({ title: '状态已更新', icon: 'success' })
              this.loadJob()
            } else {
              wx.showToast({ title: result.errMsg, icon: 'none' })
            }
          })
        }
      }
    })
  },

  onSheetClose() {
    this.setData({ showStatusSheet: false })
  },

  // ========== 删除 ==========
  onDelete() {
    wx.showModal({
      title: '删除岗位',
      content: `确定删除「${this.data.job.company} - ${this.data.job.position}」吗？此操作不可恢复。`,
      confirmColor: '#FF4D4F',
      success: (res) => {
        if (res.confirm) {
          this.setData({ deleting: true })
          api.deleteJob(this.data.jobId).then(result => {
            if (result.success) {
              app.markDirty(['jobs', 'today', 'mine'])
              wx.showToast({ title: '已删除', icon: 'success' })
              setTimeout(() => wx.navigateBack(), 800)
            } else {
              wx.showToast({ title: result.errMsg, icon: 'none' })
              this.setData({ deleting: false })
            }
          })
        }
      }
    })
  }
})
