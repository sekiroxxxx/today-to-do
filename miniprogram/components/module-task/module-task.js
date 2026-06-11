// module-task: 配置驱动的通用任务卡片
Component({
  properties: {
    title:       { type: String, value: '' },
    description: { type: String, value: '' },
    badges:      { type: Array,  value: [] },   // [{ text, color, bg }]
    meta:        { type: Array,  value: [] },   // [{ label, value }]
    actions:     { type: Array,  value: [] },   // [{ text, type, key }]
    taskType:    { type: String, value: 'simple' }, // 'simple' | 'progress'
    completed:   { type: Boolean, value: false }
  },

  methods: {
    onAction(e) {
      this.triggerEvent('action', { key: e.currentTarget.dataset.key })
    },
    onComplete() {
      this.triggerEvent('complete')
    }
  }
})
