// 空状态组件 — 数据为空时的占位展示
Component({
  properties: {
    text: { type: String, value: '暂无数据' },
    showBtn: { type: Boolean, value: false },
    btnText: { type: String, value: '' }
  },
  methods: {
    onTapBtn() { this.triggerEvent('action') }
  }
})
