// 星级评分组件 — 1~5 星点击评分
Component({
  properties: {
    value: { type: Number, value: 0 },        // 当前评分 0~5
    max: { type: Number, value: 5 },
    readonly: { type: Boolean, value: false }, // 是否只读
    size: { type: String, value: 'md' }        // 'sm' | 'md' | 'lg'
  },

  methods: {
    onTap(e) {
      if (this.properties.readonly) return
      const score = Number(e.currentTarget.dataset.index)
      this.triggerEvent('change', { value: score })
    }
  }
})
