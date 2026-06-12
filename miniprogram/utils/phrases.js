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

// 状态页鼓励（按完成率范围）
const ENCOURAGEMENT = [
  { min: 0.9,  text: '效率拉满！这周几乎全清了' },
  { min: 0.7,  text: '不错，大部分都搞定了' },
  { min: 0.5,  text: '刚好过半，下周加把劲' },
  { min: 0.01, text: '这周有点摆，下周转运吧' },
  { min: -1,   text: '本周还没有行动记录' }
]

// 评级配置（阈值、标签、颜色）
const RATING_TIERS = [
  { min: 80, label: 'S', bg: '#FFF1F0', color: '#CF1322' },
  { min: 55, label: 'A', bg: '#FFFBE6', color: '#D48A00' },
  { min: 25, label: 'B', bg: '#F9F0FF', color: '#722ED1' },
  { min: 0,  label: 'C', bg: '#E6FFFB', color: '#08979C' }
]

// 模块配置（v1.1 → v1.2 加 config）
const MODULES = [
  { key: 'jobseeker', icon: '🎯', name: '求职日常', color: '#CF1322', config: { dailyLimit: 5, limitLabel: '每日推荐上限', limitRange: [1, 10] } },
  { key: 'work',      icon: '💼', name: '工作日常', color: '#D48A00' },
  { key: 'study',     icon: '🎓', name: '学业日常', color: '#1677FF' },
  { key: 'freelance', icon: '🚀', name: '自由职业', color: '#722ED1' },
  { key: 'custom',    icon: '📝', name: '自定义任务', color: '#999999' }
]

// Tab 名称（文档约定值，json 里同步改）
const TAB_NAMES = {
  today: '日常',
  jobs: '求职',
  tasks: '任务',
  mine: '我的'
}

// 默认昵称
const DEFAULT_NICKNAME = '冒险者'

/** 根据分数查评级 */
function getRating(score) {
  for (const tier of RATING_TIERS) {
    if (score >= tier.min) return tier
  }
  return RATING_TIERS[RATING_TIERS.length - 1]
}

/** 获取模块配置（用户值优先于模块默认） */
function getModuleConfig(key, user) {
  const mod = MODULES.find(function (m) { return m.key === key })
  const defaults = (mod && mod.config) || { dailyLimit: 5, limitLabel: '每日上限', limitRange: [1, 10] }
  // 用户个性化值：modulePrefs[module].dailyLimit 覆盖默认
  if (user && user.modulePrefs && user.modulePrefs[key]) {
    return Object.assign({}, defaults, user.modulePrefs[key])
  }
  // 兼容旧数据：preferences.dailyLimit（仅 jobseeker 模块使用）
  if (key === 'jobseeker' && user && user.preferences && user.preferences.dailyLimit) {
    return Object.assign({}, defaults, { dailyLimit: user.preferences.dailyLimit })
  }
  return defaults
}

/** 从数组中随机取一个 */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

module.exports = {
  COMPLETE,
  ENCOURAGEMENT,
  RATING_TIERS,
  TAB_NAMES,
  MODULES,
  DEFAULT_NICKNAME,
  getModuleConfig,
  getRating,
  pick
}
