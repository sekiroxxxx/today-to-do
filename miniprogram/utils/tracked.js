/**
 * tracked.js — tracked_items + completed_log 直连数据库实现
 *
 * 方案二新增。替代旧 api-db.js 中的 job_applications 和 daily_actions 操作。
 * 由 api.js 包装后对外暴露，页面层不直接引用。
 */

const algorithm = require('./algorithm')

function db() { return wx.cloud.database() }
function dateStr(d) { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}` }

// ==================== jobseeker 生命周期（方案三移到 modules.js） ====================

const JOB_LIFECYCLE = {
  steps: [
    { status: '待投递', label: '待投递', transitions: ['已投递', '已拒绝'], terminal: false },
    { status: '已投递', label: '已投递', transitions: ['面试中', '已拒绝'], terminal: false },
    { status: '面试中', label: '面试中', transitions: ['Offer', '已拒绝'], terminal: false },
    { status: 'Offer', label: 'Offer', transitions: [], terminal: true },
    { status: '已拒绝', label: '已关闭', transitions: [], terminal: true }
  ],
  initialState: '待投递',
  terminalStatuses: ['Offer', '已拒绝']
}

function nextActionDate(status) {
  const d = new Date()
  if (status === '待投递') return d
  if (status === '已投递') { d.setDate(d.getDate() + 3); return d }
  if (status === '面试中') { d.setDate(d.getDate() + 1); return d }
  return null
}

// ==================== tracked_items ====================

module.exports = {

  /** 添加追踪项 → { success, item } */
  addTrackedItem: async function (data) {
    const mod = data.module || 'jobseeker'
    const lifecycle = mod === 'jobseeker' ? JOB_LIFECYCLE : { steps: [], initialState: '', terminalStatuses: [] }
    const status = data.status || lifecycle.initialState
    const now = db().serverDate()
    const item = {
      module: mod,
      title: (data.title || '').trim(),
      description: (data.description || '').trim(),
      status: status,
      lifecycle: lifecycle,
      fields: data.fields || {},
      statusHistory: [{ status, time: now, note: '添加' }],
      _dirty: true,
      createdAt: now,
      updatedAt: now
    }
    if (status === '待投递') item.nextActionDate = new Date()
    const result = await db().collection('tracked_items').add({ data: item })
    item._id = result._id
    return { success: true, item }
  },

  /** 查询追踪项列表 → { success, items, total } */
  getTrackedItems: async function (filter = {}) {
    const cond = {}
    if (filter.module) cond.module = filter.module
    if (filter.status) cond.status = filter.status
    if (filter.keyword && filter.keyword.trim()) {
      const kw = filter.keyword.trim()
      cond.$or = [
        { title: db().RegExp({ regexp: kw, options: 'i' }) },
        { 'fields.company': db().RegExp({ regexp: kw, options: 'i' }) },
        { 'fields.position': db().RegExp({ regexp: kw, options: 'i' }) }
      ]
    }
    const result = await db().collection('tracked_items').where(cond).orderBy('createdAt', 'desc').get()
    return { success: true, items: result.data, total: result.data.length }
  },

  /** 获取活跃追踪项（非终态，给算法用） */
  getActiveTrackedItems: async function () {
    const _ = db().command
    const result = await db().collection('tracked_items')
      .where({ status: _.nin(JOB_LIFECYCLE.terminalStatuses) }).get()
    return result.data
  },

  /** 更新追踪项基本信息 → { success, item } */
  updateTrackedItem: async function (data) {
    if (!data.itemId) return { success: false, errMsg: '缺少 ID' }
    const updateData = { _dirty: true, updatedAt: db().serverDate() }
    if (data.title !== undefined) updateData.title = data.title.trim()
    if (data.description !== undefined) updateData.description = data.description.trim()
    if (data.fields) updateData.fields = data.fields
    if (data.status) updateData.status = data.status
    if (Object.keys(updateData).length <= 2) return { success: false, errMsg: '没有需要更新的字段' }
    await db().collection('tracked_items').doc(data.itemId).update({ data: updateData })
    const updated = await db().collection('tracked_items').doc(data.itemId).get()
    return { success: true, item: updated.data }
  },

  /** 推进追踪项状态 → { success, item } */
  updateTrackedItemStatus: async function (data) {
    if (!data.itemId) return { success: false, errMsg: '缺少 ID' }
    if (!data.newStatus) return { success: false, errMsg: '缺少目标状态' }
    const exist = await db().collection('tracked_items').doc(data.itemId).get()
    if (!exist.data) return { success: false, errMsg: '记录不存在或无权修改' }
    const item = exist.data
    const lifecycle = item.lifecycle || JOB_LIFECYCLE
    const curStep = lifecycle.steps.find(s => s.status === item.status)
    if (!curStep) return { success: false, errMsg: `未知当前状态: ${item.status}` }
    if (curStep.terminal) return { success: false, errMsg: `当前状态"${item.status}"为终态，不可再变更` }
    if (!curStep.transitions.includes(data.newStatus)) return { success: false, errMsg: `"${item.status}"不能变更为"${data.newStatus}"，允许: ${curStep.transitions.join('、')}` }

    const serverTime = db().serverDate()
    const updateData = {
      status: data.newStatus,
      updatedAt: serverTime,
      _dirty: true,
      statusHistory: db().command.push({ status: data.newStatus, time: serverTime, note: data.note || '' })
    }
    const nextDate = nextActionDate(data.newStatus)
    if (nextDate) updateData.nextActionDate = nextDate
    if (lifecycle.terminalStatuses.includes(data.newStatus)) {
      updateData.postponeCount = 0
      updateData.nextActionDate = null
    }

    await db().collection('tracked_items').doc(data.itemId).update({ data: updateData })
    const updated = await db().collection('tracked_items').doc(data.itemId).get()
    return { success: true, item: updated.data }
  },

  /** 删除追踪项 → { success } */
  deleteTrackedItem: async function (itemId) {
    if (!itemId) return { success: false, errMsg: '缺少 ID' }
    await db().collection('daily_actions').where({ sourceId: itemId }).remove()
    await db().collection('tracked_items').doc(itemId).remove()
    return { success: true }
  },

  // ==================== completed_log ====================

  /** 写入完成日志 → { success } */
  logComplete: async function (data) {
    const entry = {
      date: data.date || dateStr(new Date()),
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      title: data.title,
      module: data.module || 'jobseeker'
    }
    await db().collection('completed_log').add({ data: entry })
    return { success: true }
  },

  /** 按日期范围查询完成日志 → { success, logs } */
  getCompletedLogs: async function (startDate, endDate) {
    const _ = db().command
    const result = await db().collection('completed_log')
      .where({ date: _.gte(startDate).and(_.lte(endDate)) }).get()
    return { success: true, logs: result.data }
  },

  /** 获取统计（替代旧 api-db getStats） */
  getStatsFromLogs: async function (range = 'week') {
    const days = range === 'month' ? 30 : 7
    const endDate = new Date(); endDate.setHours(23, 59, 59, 999)
    const startDate = new Date(); startDate.setDate(startDate.getDate() - (days - 1)); startDate.setHours(0, 0, 0, 0)
    const startStr = dateStr(startDate); const endStr = dateStr(endDate)
    const _ = db().command

    const logsResult = await db().collection('completed_log')
      .where({ date: _.gte(startStr).and(_.lte(endStr)) }).get()
    const itemsResult = await db().collection('tracked_items').where({}).get()

    const logs = logsResult.data
    const total = logs.length
    const completed = logs.length  // completed_log 中每条都是完成

    // 每日明细
    const dailyMap = {}
    for (let i = 0; i < days; i++) { const d = new Date(startDate); d.setDate(d.getDate() + i); const key = dateStr(d); dailyMap[key] = { date: key, completed: 0, postponed: 0, total: 0 } }
    logs.forEach(l => { if (dailyMap[l.date]) { dailyMap[l.date].completed++; dailyMap[l.date].total++ } })

    // 漏斗
    const funnel = { pending: 0, applied: 0, interviewing: 0, offer: 0, rejected: 0 }
    itemsResult.data.forEach(item => {
      switch (item.status) {
        case '待投递': funnel.pending++; break; case '已投递': funnel.applied++; break
        case '面试中': funnel.interviewing++; break; case 'Offer': funnel.offer++; break; case '已拒绝': funnel.rejected++; break
      }
    })

    const trackerLogs = logs.filter(l => l.sourceType === 'tracked')
    const customLogs = logs.filter(l => l.sourceType === 'custom')
    const completionRate = total > 0 ? 1 : 0  // completed_log 中所有记录都是完成

    return {
      success: true, range, startDate: startStr, endDate: endStr,
      summary: { total, completed, postponed: 0, completionRate },
      funnel, dailyDetail: Object.values(dailyMap),
      categoryBreakdown: {
        job: { total: trackerLogs.length, completed: trackerLogs.length },
        custom: { total: customLogs.length, completed: customLogs.length }
      }
    }
  }
}
