// 求职管理 — 岗位列表 + 投递漏斗
const api = require('../../utils/api')
const app = getApp()

Page({
  data: {
    jobs: [],               // 岗位列表
    filteredJobs: [],       // 筛选后的列表
    funnel: {               // 漏斗数据
      pending: 0, applied: 0, interviewing: 0, offer: 0, rejected: 0
    },
    funnelTotal: 0,         // 总岗位数，用于计算百分比宽度
    closedCount: 0,         // 已关闭岗位数
    currentFilter: 'all',   // 当前筛选：'all' | '待投递' | '已投递' | '面试中' | 'Offer' | '已关闭'
    keyword: '',            // 搜索关键词
    loading: true
  },

  onShow() {
    // 缓存干净直接跳过，脏了才重新请求
    if (!app.globalData.dirty.jobs) return

    const hasData = this.data.jobs.length > 0
    this.loadData(!hasData)
  },

  // ========== 加载数据 ==========
  async loadData(showLoading = false) {
    if (showLoading) {
      this.setData({ loading: true })
    }
    try {
      // 先拉岗位列表，马上渲染
      const jobRes = await api.getJobList()
      const jobs = jobRes.jobs || []
      const filtered = this.applyFilter(jobs, this.data.currentFilter, this.data.keyword)

      // 从岗位列表本地算出漏斗，不等 getStats（消除延迟）
      const localFunnel = this.calcFunnel(jobs)

      var closedCount = jobs.filter(function (j) { return j.status === '已拒绝' }).length

      this.setData({
        jobs: jobs,
        filteredJobs: filtered,
        funnel: localFunnel,
        funnelTotal: jobs.length,
        closedCount: closedCount,
        loading: false
      })
      app.globalData.dirty.jobs = false

      // 后台无声更新来自 getStats 的漏斗（可能含已删除岗位的历史数据）
      const statsRes = await api.getStats('week')
      if (statsRes.funnel) {
        this.setData({
          funnel: statsRes.funnel,
          funnelTotal: Object.values(statsRes.funnel).reduce((a, b) => a + b, 0)
        })
      }
    } catch {
      this.setData({ loading: false })
      app.globalData.dirty.jobs = false
    }
  },

  // 从岗位列表本地计算漏斗（马上渲染，不等 getStats 云函数）
  calcFunnel(jobs) {
    const funnel = { pending: 0, applied: 0, interviewing: 0, offer: 0, rejected: 0 }
    jobs.forEach(j => {
      const key = { '待投递': 'pending', '已投递': 'applied', '面试中': 'interviewing', 'Offer': 'offer', '已拒绝': 'rejected' }[j.status]
      if (key) funnel[key]++
    })
    return funnel
  },

  // ========== 筛选 ==========
  onFilterTap(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({
      currentFilter: filter,
      filteredJobs: this.applyFilter(this.data.jobs, filter, this.data.keyword)
    })
  },

  // ========== 搜索 ==========
  onSearchInput(e) {
    const keyword = e.detail.value
    this.setData({
      keyword,
      filteredJobs: this.applyFilter(this.data.jobs, this.data.currentFilter, keyword)
    })
  },

  // 应用筛选 + 搜索条件
  applyFilter(jobs, filter, keyword) {
    let result = jobs
    // 状态筛选
    if (filter && filter !== 'all') {
      result = result.filter(j => j.status === filter)
    }
    // 关键词搜索
    if (keyword && keyword.trim()) {
      const kw = keyword.trim().toLowerCase()
      result = result.filter(j =>
        (j.company && j.company.toLowerCase().includes(kw)) ||
        (j.position && j.position.toLowerCase().includes(kw))
      )
    }
    return result
  },

  // ========== 清理已关闭岗位 ==========
  onCleanupClosed() {
    var ctx = this
    wx.showModal({
      title: '清理已关闭岗位',
      content: '将删除所有已关闭的岗位，此操作不可恢复',
      confirmColor: '#FF4D4F',
      success: function (res) {
        if (res.confirm) {
          var closedJobs = ctx.data.jobs.filter(function (j) { return j.status === '已拒绝' })
          var total = closedJobs.length
          var done = 0
          closedJobs.forEach(function (j) {
            api.deleteJob(j._id).then(function () {
              done++
              if (done >= total) {
                wx.showToast({ title: '已清理 ' + total + ' 个岗位', icon: 'success' })
                app.markDirty(['today', 'mine'])
                ctx.loadData()
              }
            })
          })
        }
      }
    })
  },

  // ========== 导航 ==========
  onAddJob() {
    wx.navigateTo({ url: '/pages/jobs/add/add' })
  },

  onJobDetail(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/jobs/detail/detail?id=${id}` })
  },

  // ========== 快速操作：点状态标签推进 ==========
  onQuickAdvance(e) {
    const { id, status } = e.currentTarget.dataset
    const statusFlow = {
      '待投递': { next: '已投递', label: '已投递' },
      '已投递': { next: '面试中', label: '面试中' },
      '面试中': { next: 'Offer',  label: 'Offer' }
    }
    const next = statusFlow[status]
    if (!next) return

    wx.showModal({
      title: '推进状态',
      content: `将状态改为「${next.label}」？`,
      success: (res) => {
        if (res.confirm) {
          api.updateJobStatus({ jobId: id, newStatus: next.next }).then(result => {
            if (result.success) {
              wx.showToast({ title: '已更新', icon: 'success' })
              app.markDirty(['today', 'mine'])
              this.loadData()
            } else {
              wx.showToast({ title: result.errMsg, icon: 'none' })
            }
          })
        }
      }
    })
  },

  // ========== 下拉刷新 ==========
  onPullDownRefresh() {
    wx.showNavigationBarLoading()
    this.loadData().then(() => {
      wx.hideNavigationBarLoading()
      wx.stopPullDownRefresh()
    })
  }
})
