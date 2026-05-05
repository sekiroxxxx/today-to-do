// 求职管理 — 岗位列表 + 投递漏斗
const api = require('../../utils/api')

Page({
  data: {
    jobs: [],               // 岗位列表
    filteredJobs: [],       // 筛选后的列表
    funnel: {               // 漏斗数据
      pending: 0, applied: 0, interviewing: 0, offer: 0, rejected: 0
    },
    funnelTotal: 0,         // 总岗位数，用于计算百分比宽度
    currentFilter: 'all',   // 当前筛选：'all' | '待投递' | '已投递' | '面试中' | 'Offer' | '已拒绝'
    keyword: '',            // 搜索关键词
    loading: true
  },

  onShow() {
    // 已有数据 → 静默刷新；首次加载 → 显示加载态
    const hasData = this.data.jobs.length > 0
    this.loadData(!hasData)
  },

  // ========== 加载数据 ==========
  async loadData(showLoading = false) {
    if (showLoading) {
      this.setData({ loading: true })
    }
    try {
      const [jobRes, statsRes] = await Promise.all([
        api.getJobList(),
        api.getStats('week')
      ])

      const jobs = jobRes.jobs || []
      this.setData({
        jobs,
        filteredJobs: this.applyFilter(jobs, this.data.currentFilter, this.data.keyword),
        funnel: statsRes.funnel || { pending: 0, applied: 0, interviewing: 0, offer: 0, rejected: 0 },
        funnelTotal: (statsRes.funnel ? Object.values(statsRes.funnel).reduce((a, b) => a + b, 0) : 0),
        loading: false
      })
    } catch {
      this.setData({ loading: false })
    }
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
    this.loadData().then(() => wx.stopPullDownRefresh())
  }
})
