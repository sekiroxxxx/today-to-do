// card-jobseeker: 求职模块任务卡片
Component({
  properties: {
    action:    { type: Object, value: null },
    completed: { type: Boolean, value: false }
  },

  data: {
    // 推进按钮文案映射
    toolLabelMap: {
      '待投递': '投了',
      '已投递': '面试',
      '面试中': 'Offer'
    }
  },

  methods: {
    // 点击卡片 → 跳转岗位详情
    onCardTap() {
      var action = this.data.action
      this.triggerEvent('nav', {
        actionId: action._id,
        jobId: action.sourceId
      })
    },

    // 推进按钮
    onTool() {
      var action = this.data.action
      var jobInfo = action.jobInfo || {}
      this.triggerEvent('tool', {
        toolName: 'advance',
        actionId: action._id,
        jobId: action.sourceId,
        currentStatus: jobInfo.status || ''
      })
    },

    // 完成按钮
    onComplete() {
      this.triggerEvent('complete', { actionId: this.data.action._id })
    }
  }
})
