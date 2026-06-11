// 星级评分组件 — 1~5 星 + 文字描述
const DESCRIPTIONS = ['', '很差', '一般', '还行', '不错', '极好']

Component({
  properties: {
    value: { type: Number, value: 0 },
    max: { type: Number, value: 5 },
    readonly: { type: Boolean, value: false },
    size: { type: String, value: 'md' }
  },

  data: { desc: '' },

  observers: {
    'value': function (val) {
      this.setData({ desc: DESCRIPTIONS[val] || '' })
    }
  },

  methods: {
    onTap(e) {
      if (this.properties.readonly) return
      const score = Number(e.currentTarget.dataset.index)
      this.triggerEvent('change', { value: score })
    }
  }
})
