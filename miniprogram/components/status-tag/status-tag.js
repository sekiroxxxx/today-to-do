// 状态标签组件 v1.1 — displayText 做"已拒绝→已关闭"映射
Component({
  properties: {
    status: { type: String, value: '' },
    text: { type: String, value: '' }
  },

  observers: {
    'status,text': function (status, text) {
      const displayMap = { '已拒绝': '已关闭' }
      const tagClass = this.data.colorMap[status] || ''
      this.setData({ displayText: text || displayMap[status] || status, tagClass })
    }
  },

  data: {
    displayText: '',
    colorMap: {
      '待投递': 'tag--pending',
      '已投递': 'tag--applied',
      '面试中': 'tag--interview',
      'Offer': 'tag--offer',
      '已拒绝': 'tag--closed',
      'job': 'tag--pending',
      'custom': 'tag--custom'
    }
  }
})
