// card-default: 非求职模块任务卡片（work/study/freelance/custom）
Component({
  properties: {
    action:    { type: Object, value: null },
    completed: { type: Boolean, value: false }
  },

  data: {
    priMap: {
      1: { color: '#FF4D4F', label: '高' },
      2: { color: '#FAAD14', label: '中' },
      3: { color: '#52C41A', label: '低' }
    }
  },

  computed: {},

  methods: {
    onComplete() {
      this.triggerEvent('complete', { actionId: this.data.action._id })
    },

    onEdit() {
      var action = this.data.action
      this.triggerEvent('edit', {
        actionId: action._id,
        sourceId: action.sourceId
      })
    }
  }
})
