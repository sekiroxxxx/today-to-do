// 星级评分组件 — 1~5 星
Component({
  properties: {
    value: { type: Number, value: 0 },
    max: { type: Number, value: 5 },
    readonly: { type: Boolean, value: false },
    size: { type: String, value: 'md' }
  },

  methods: {
    onTap(e) {
      if (this.properties.readonly) return
      const score = Number(e.currentTarget.dataset.index)
      this.triggerEvent('change', { value: score })
    }
  }
})
