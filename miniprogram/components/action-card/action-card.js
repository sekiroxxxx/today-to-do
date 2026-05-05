// 行动卡片组件 — 今日首页的核心展示单元
const api = require('../../utils/api')

Component({
  /**
   * 外部传入的 action 对象：
   * {
   *   _id, sourceType, sourceId, title, description,
   *   normalizedScore, completed, postponed
   * }
   */
  properties: {
    action: {
      type: Object,
      value: {}
    }
  },

  data: {
    // 动画状态
    completing: false,   // 完成动画进行中
    postponing: false,   // 推迟动画进行中
    removed: false,      // 卡片已移除
    // 推迟弹窗
    showPostponeSheet: false
  },

  methods: {
    // ========== 完成操作 ==========
    onTapComplete() {
      if (this.data.completing) return
      this.setData({ completing: true })

      const actionId = this.properties.action._id
      const sourceType = this.properties.action.sourceType

      api.completeAction(actionId).then(res => {
        if (!res.success) {
          this.setData({ completing: false })
          wx.showToast({ title: res.errMsg || '操作失败', icon: 'none' })
          return
        }

        // 求职类：弹窗询问是否同步推进状态
        if (sourceType === 'job' && res.jobInfo) {
          this.askStatusUpdate(res.jobInfo)
        } else {
          // 自定义任务：直接完成
          wx.showToast({ title: '已完成', icon: 'success', duration: 1500 })
          this.animateAndRemove()
        }
      })
    },

    // 询问用户是否同步推进岗位状态
    askStatusUpdate(jobInfo) {
      const statusMap = {
        '待投递': { next: '已投递', label: '已投递简历' },
        '已投递': { next: '面试中', label: '进入面试' },
        '面试中': { next: 'Offer',  label: '拿到 Offer' }
      }
      const option = statusMap[jobInfo.status]
      if (!option) {
        // 已是终态，直接完成
        wx.showToast({ title: '已完成', icon: 'success', duration: 1500 })
        this.animateAndRemove()
        return
      }

      wx.showModal({
        title: '同步更新状态？',
        content: `是否将「${jobInfo.company} - ${jobInfo.position}」的状态更新为「${option.label}」？`,
        confirmText: '是',
        cancelText: '否',
        success: (modalRes) => {
          if (modalRes.confirm) {
            // 用户确认：调用 updateJobStatus
            api.updateJobStatus({
              jobId: jobInfo._id,
              newStatus: option.next
            }).then(() => {
              wx.showToast({ title: '状态已更新', icon: 'success', duration: 1500 })
              this.animateAndRemove()
            })
          } else {
            // 用户拒绝：仅完成 action，不变更状态
            wx.showToast({ title: '已完成', icon: 'success', duration: 1500 })
            this.animateAndRemove()
          }
        }
      })
    },

    // ========== 推迟操作 ==========
    onTapPostpone() {
      if (this.data.postponing) return
      // 弹出底部选择：稍后提醒 / 跳过今天
      this.setData({ showPostponeSheet: true })
    },

    // 用户选择了推迟方式
    onPostponeSelect(e) {
      const postponeType = e.currentTarget.dataset.type  // 'later' | 'skip'
      this.setData({ showPostponeSheet: false, postponing: true })

      const actionId = this.properties.action._id

      api.postponeAction(actionId, postponeType).then(res => {
        if (!res.success) {
          this.setData({ postponing: false })
          wx.showToast({ title: res.errMsg || '操作失败', icon: 'none' })
          return
        }

        const msg = postponeType === 'later' ? '已推迟，稍后提醒' : '已跳过，明天再见'
        wx.showToast({ title: msg, icon: 'none', duration: 1500 })

        // 触发父页面事件，传递需要重新生成
        this.triggerEvent('postpone', { id: actionId, type: postponeType })
        this.animateAndRemove()
      })
    },

    closeSheet() {
      this.setData({ showPostponeSheet: false })
    },

    // ========== 动画：卡片淡出 + 上滑 ==========
    animateAndRemove() {
      setTimeout(() => {
        this.setData({ removed: true })
        // 通知父页面刷新
        this.triggerEvent('complete', { id: this.properties.action._id })
      }, 400)
    },

    // ========== 阻止冒泡（弹窗背景点击关闭） ==========
    noop() {}
  }
})
