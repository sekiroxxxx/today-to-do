// 统一创建页 — 模块选择器 + 配置驱动表单
const api = require('../../utils/api')
const phrases = require('../../utils/phrases')

// 节流
let lastSubmitTime = 0
const SUBMIT_GAP = 2000

// 各模块的表单字段默认值
const FORM_DEFAULTS = {
  jobseeker:  { company: '', position: '', salaryRange: '', applyLink: '', deadline: '', attractionScore: 3, preparednessScore: 1 },
  work:       { title: '', deadline: '', project: '', priority: 2 },
  study:      { title: '', note: '', priority: 2, estimatedMinutes: '', deadline: '', repeatType: 'none', repeatDays: [] },
  freelance:  { title: '', note: '', priority: 2, estimatedMinutes: '', deadline: '', repeatType: 'none', repeatDays: [] },
  custom:     { title: '', note: '', priority: 2, estimatedMinutes: '', deadline: '', repeatType: 'none', repeatDays: [] }
}

Page({
  data: {
    modules: phrases.MODULES,
    currentModule: 'custom',
    today: '',
    form: {},
    saving: false,
    weekdays: [
      { value: 1, label: '一', active: false },
      { value: 2, label: '二', active: false },
      { value: 3, label: '三', active: false },
      { value: 4, label: '四', active: false },
      { value: 5, label: '五', active: false },
      { value: 6, label: '六', active: false },
      { value: 7, label: '日', active: false }
    ]
  },

  onLoad() {
    this.setData({ today: getDateString(new Date()) })
    this.switchModule('custom')
  },

  // ========== 模块切换 ==========
  switchModule(key) {
    const mod = phrases.MODULES.find(m => m.key === key)
    if (!mod) return
    wx.setNavigationBarTitle({ title: `添加${mod.name}任务` })
    this.setData({
      currentModule: key,
      form: { ...FORM_DEFAULTS[key] || FORM_DEFAULTS.custom }
    })
  },

  onModuleTap(e) {
    this.switchModule(e.currentTarget.dataset.key)
  },

  // ========== 通用表单绑定 ==========
  onInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onPrioritySelect(e) {
    this.setData({ 'form.priority': Number(e.currentTarget.dataset.priority) })
  },

  onDeadlineChange(e) {
    this.setData({ 'form.deadline': e.detail.value })
  },

  onAttractionChange(e) {
    this.setData({ 'form.attractionScore': e.detail.value })
  },
  onPreparednessChange(e) {
    this.setData({ 'form.preparednessScore': e.detail.value })
  },

  // ========== 重复规则（custom/study/freelance） ==========
  onRepeatTypeSelect(e) {
    this.setData({ 'form.repeatType': e.currentTarget.dataset.type })
  },

  onWeekdayToggle(e) {
    const day = Number(e.currentTarget.dataset.day)
    let days = [...this.data.form.repeatDays]
    const idx = days.indexOf(day)
    if (idx > -1) days.splice(idx, 1)
    else days.push(day)
    days.sort((a, b) => a - b)
    this.setData({ 'form.repeatDays': days })
    this.syncWeekdayActive(days)
  },

  syncWeekdayActive(days) {
    const weekdays = this.data.weekdays.map(w => ({ ...w, active: days.includes(w.value) }))
    this.setData({ weekdays })
  },

  // ========== 提交 ==========
  onSubmit() {
    const now = Date.now()
    if (now - lastSubmitTime < SUBMIT_GAP) return
    lastSubmitTime = now

    const { currentModule, form } = this.data

    // 校验
    if (currentModule === 'jobseeker') {
      if (!form.company || !form.company.trim()) return wx.showToast({ title: '请输入公司名称', icon: 'none' })
      if (!form.position || !form.position.trim()) return wx.showToast({ title: '请输入岗位名称', icon: 'none' })
    } else {
      if (!form.title || !form.title.trim()) return wx.showToast({ title: '请输入任务标题', icon: 'none' })
      if (form.repeatType === 'weekly' && (!Array.isArray(form.repeatDays) || form.repeatDays.length === 0)) {
        return wx.showToast({ title: '请选择至少一个星期几', icon: 'none', duration: 2000 })
      }
    }

    this.setData({ saving: true })

    // 求职 → addJob，其他 → addTask({ module })
    const action = currentModule === 'jobseeker'
      ? api.addJob({
          company: form.company.trim(), position: form.position.trim(),
          salaryRange: form.salaryRange.trim(), applyLink: form.applyLink.trim(),
          deadline: form.deadline,
          attractionScore: form.attractionScore, preparednessScore: form.preparednessScore
        })
      : api.addTask({
          title: form.title.trim(), note: (form.note || '').trim(),
          priority: form.priority,
          estimatedMinutes: Number(form.estimatedMinutes) || 0,
          deadline: form.deadline,
          repeatRule: { type: form.repeatType, daysOfWeek: form.repeatType === 'weekly' ? form.repeatDays : [] },
          module: currentModule
        })

    action.then(res => {
      if (res.success) {
        getApp().markDirty(['tasks', 'today', 'jobs', 'mine'])
        wx.showToast({ title: '已添加', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 800)
      } else {
        wx.showToast({ title: res.errMsg || '操作失败', icon: 'none' })
        this.setData({ saving: false })
      }
    }).catch(() => {
      this.setData({ saving: false })
    })
  }
})

function getDateString(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
