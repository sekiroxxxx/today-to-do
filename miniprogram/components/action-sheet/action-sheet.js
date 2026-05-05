// 通用底部弹窗组件 — 用于选择、确认等场景
Component({
  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: '' },     // 弹窗标题
    items: { type: Array, value: [] }       // [{ label, desc, value, highlight }]
    // highlight 为 true 时文字变红（危险操作）
  },

  methods: {
    // 选中某一项
    onSelect(e) {
      const { index } = e.currentTarget.dataset
      this.triggerEvent('select', { index, item: this.properties.items[index] })
    },

    // 关闭弹窗
    onClose() {
      this.triggerEvent('close')
    },

    // 阻止冒泡
    noop() {}
  }
})
