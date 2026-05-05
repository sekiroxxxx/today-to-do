// 状态标签组件 — 彩色标签展示岗位状态
Component({
  properties: {
    status: { type: String, value: '' },  // '待投递' | '已投递' | '面试中' | 'Offer' | '已拒绝' | 'job' | 'custom'
    text: { type: String, value: '' }      // 展示文字，不传则用 status
  },

  computed: {},

  // 标签配色映射（在 WXML 中用 wx:if 做条件样式更直接）
  data: {
    colorMap: {
      '待投递': 'tag--pending',
      '已投递': 'tag--applied',
      '面试中': 'tag--interview',
      'Offer': 'tag--offer',
      '已拒绝': 'tag--rejected',
      'job': 'tag--pending',     // 今日页面的"求职"标签
      'custom': 'tag--custom'    // 今日页面的"自定义"标签
    }
  }
})
