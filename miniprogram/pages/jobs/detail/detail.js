// 岗位详情页
const api = require('../../../utils/api')
const app = getApp()

// 按状态动态展示的拒绝原因
const REJECT_REASONS = {
  '待投递': [
    { label: '简历没准备好', value: '简历没准备好' },
    { label: '岗位要求不匹配', value: '岗位要求不匹配' },
    { label: '公司评价不好', value: '公司评价不好' },
    { label: '已招到人', value: '已招到人' }
  ],
  '已投递': [
    { label: '简历被筛掉', value: '简历被筛掉' },
    { label: 'HR 已读不回', value: 'HR 已读不回' },
    { label: '超时无回应', value: '超时无回应' },
    { label: '找到更好的了', value: '找到更好的了' }
  ],
  '面试中': [
    { label: '一面没过', value: '一面没过' },
    { label: '二面没过', value: '二面没过' },
    { label: '终面没过', value: '终面没过' },
    { label: '主动放弃', value: '主动放弃' }
  ]
}

Page({
  data: {
    jobId: '',
    job: null,
    loading: true,
    // 推进弹窗
    showStatusSheet: false,
    statusItems: [],
    // 拒绝面板
    showRejectSheet: false,
    rejectReasons: [],
    selectedRejectReason: '',
    customRejectReason: '',
    // 删除
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

  // ========== 复制投递链接 ==========
  onCopyLink(e) {
    const link = e.currentTarget.dataset.link
    if (!link) return
    wx.setClipboardData({
      data: link,
      success: () => wx.showToast({ title: '链接已复制', icon: 'success' })
    })
  },

  // ========== 编辑 ==========
  onEdit() {
    wx.navigateTo({ url: '/pages/form/form?mode=edit&type=job&id=' + this.data.jobId })
  },

  // ========== 推进状态（仅正向流转） ==========
  onAdvanceStatus() {
    const { job } = this.data
    const transitions = {
      '待投递': [{ label: '已投递简历', value: '已投递', desc: '确认已完成投递' }],
      '已投递': [{ label: '进入面试', value: '面试中', desc: '收到面试邀请' }],
      '面试中': [{ label: '拿到 Offer', value: 'Offer', desc: '恭喜！' }]
    }
    const items = transitions[job.status] || []

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
          // 先本地更新 + toast
          this.setData({ 'job.status': item.value })
          wx.showToast({ title: '状态已更新', icon: 'success' })
          // 后台 API
          var ctx = this
          api.updateJobStatus({
            jobId: ctx.data.jobId,
            newStatus: item.value
          }).then(function (result) {
            if (result.success) {
              app.markDirty(['jobs', 'today', 'mine'])
            } else {
              wx.showToast({ title: result.errMsg, icon: 'none' })
              ctx.loadJob()
            }
          })
        }
      }
    })
  },

  onSheetClose() {
    this.setData({ showStatusSheet: false })
  },

  // ========== 拒绝 ==========
  onReject() {
    const reasons = REJECT_REASONS[this.data.job.status] || REJECT_REASONS['待投递']
    reasons.push({ label: '其他原因（手动输入）', value: 'other' })
    this.setData({
      showRejectSheet: true,
      rejectReasons: reasons,
      selectedRejectReason: '',
      customRejectReason: ''
    })
  },

  onRejectSelect(e) {
    this.setData({ selectedRejectReason: e.currentTarget.dataset.value })
  },

  onRejectReasonInput(e) {
    this.setData({ customRejectReason: e.detail.value })
  },

  onRejectConfirm() {
    const { selectedRejectReason, customRejectReason } = this.data
    if (!selectedRejectReason) {
      return wx.showToast({ title: '请选择一个原因', icon: 'none' })
    }
    // 选"其他"但没输入
    if (selectedRejectReason === 'other' && !customRejectReason.trim()) {
      return wx.showToast({ title: '请输入具体原因', icon: 'none' })
    }

    const note = selectedRejectReason === 'other'
      ? `已拒绝: ${customRejectReason.trim()}`
      : `已拒绝: ${selectedRejectReason}`

    api.updateJobStatus({
      jobId: this.data.jobId,
      newStatus: '已拒绝',
      note
    }).then(result => {
      if (result.success) {
        app.markDirty(['jobs', 'today', 'mine'])
        wx.showToast({ title: '已标记为拒绝', icon: 'success' })
        this.setData({ showRejectSheet: false })
        this.loadJob()
      } else {
        wx.showToast({ title: result.errMsg, icon: 'none' })
      }
    })
  },

  closeRejectSheet() {
    this.setData({ showRejectSheet: false })
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
