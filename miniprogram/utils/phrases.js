/**
 * 情绪文案池 — 所有随机 Toast 文案集中管理
 * 加文案只改这个文件，不改其他任何地方
 */

// 完成行动
const COMPLETE = [
  '搞定！',
  '委托达成！',
  '+1 完成度',
  '又干掉一个',
  '今日份完成',
  '拿下了',
  '已击破',
  '轻松拿下'
]

// 推迟 — 稍后提醒
const POSTPONE_LATER = [
  '待会儿见',
  '没问题，晚点做',
  '不急～',
  '先放放',
  '晚点回来'
]

// 推迟 — 跳过今天
const POSTPONE_SKIP = [
  '明天继续',
  '今天先放过你',
  '明天见',
  '明日再战',
  '好的，明天'
]

// 状态页鼓励（按完成率范围）
const ENCOURAGEMENT = [
  { min: 0.9,  text: '效率拉满！这周几乎全清了' },
  { min: 0.7,  text: '不错，大部分都搞定了' },
  { min: 0.5,  text: '刚好过半，下周加把劲' },
  { min: 0.01, text: '这周有点摆，下周转运吧' },
  { min: -1,   text: '本周还没有行动记录' }
]

// 频繁推迟（同一个 today session 内 ≥ 3 次）
const FREQUENT_POSTPONE = '今天的委托不太对？去委托页调整优先级或添加新任务吧'

/** 从数组中随机取一个 */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

module.exports = {
  COMPLETE,
  POSTPONE_LATER,
  POSTPONE_SKIP,
  ENCOURAGEMENT,
  FREQUENT_POSTPONE,
  pick
}
