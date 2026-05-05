// 定时推送提醒云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENVIRONMENT })
const db = cloud.database()
const _ = db.command

/**
 * scheduledPush 云函数
 *
 * 【功能说明】
 * 由微信云开发定时触发器调用，默认每天早上 7:00 执行一次。
 * 扫描所有用户今日未完成的行动，向已开启推送的用户发送模板消息提醒。
 *
 * 【定时触发器配置】
 * 在微信开发者工具 → 云开发 → 云函数 → scheduledPush → 触发器：
 *   - 名称：dailyMorningPush
 *   - 触发时机：自定义 Cron → "0 0 7 * * * *"（每天早上 7:00）
 *
 * 【注意】
 * 1. 此云函数由系统定时触发，不是用户调用，所以 event 里没有用户上下文
 * 2. 微信模板消息需要：
 *    a. 在微信公众平台申请模板消息（如"待办提醒"）
 *    b. 用户在小程序内点击按钮授权订阅
 *    c. 本函数调用 cloud.openapi.subscribeMessage.send() 发送
 * 3. 如果模板消息还没配置好，本函数会降级为仅记录日志
 *
 * 【出参】
 * {
 *   success: true,
 *   notifiedUsers: 3,     // 推送成功的用户数
 *   totalPending: 12,     // 待处理行动总数
 *   details: [...]        // 详细日志
 * }
 */
exports.main = async (event, context) => {
  const todayDate = getDateString(new Date())

  try {
    // ========== 第1步：查询所有用户今天未完成的行动 ==========
    // 不绑定 _openid，查询全部用户（定时触发器运行在云端，有全部数据权限）
    const actionsResult = await db.collection('daily_actions')
      .where({
        date: todayDate,
        completed: false,
        postponed: false
      })
      .get()

    const actions = actionsResult.data

    if (actions.length === 0) {
      console.log('今日无待处理行动，跳过推送')
      return {
        success: true,
        notifiedUsers: 0,
        totalPending: 0,
        details: []
      }
    }

    // ========== 第2步：按用户分组 ==========
    // 将 action 按 _openid 分组，统计每个用户的待处理数量
    const userActionsMap = {}
    actions.forEach(action => {
      if (!userActionsMap[action._openid]) {
        userActionsMap[action._openid] = {
          openid: action._openid,
          count: 0,
          topActions: []  // 取前 3 条最高分的 action 用于推送文案
        }
      }
      userActionsMap[action._openid].count++
      if (userActionsMap[action._openid].topActions.length < 3) {
        userActionsMap[action._openid].topActions.push(action.title)
      }
    })

    const userGroups = Object.values(userActionsMap)
    console.log(`今日待处理: ${actions.length} 条, 涉及 ${userGroups.length} 位用户`)

    // ========== 第3步：筛选开启了推送的用户 ==========
    const openids = userGroups.map(g => g.openid)
    const usersResult = await db.collection('users')
      .where({
        _openid: _.in(openids),
        'preferences.pushEnabled': true  // 只给开启推送的用户发送
      })
      .get()

    const pushEnabledOpenids = new Set(usersResult.data.map(u => u._openid))

    // ========== 第4步：发送模板消息 ==========
    // 微信模板消息 API：cloud.openapi.subscribeMessage.send()
    // 需要在微信公众平台先申请模板，申请到模板 ID 后替换 TEMPLATE_ID
    const TEMPLATE_ID = 'YOUR_TEMPLATE_ID'  // TODO: 替换为实际的模板消息 ID

    let notifiedUsers = 0
    const details = []

    for (const group of userGroups) {
      // 只有开启了推送的用户才发送
      if (!pushEnabledOpenids.has(group.openid)) {
        details.push({
          openid: group.openid,
          count: group.count,
          pushed: false,
          reason: '用户未开启推送或未订阅'
        })
        continue
      }

      // 尝试发送模板消息
      try {
        await cloud.openapi.subscribeMessage.send({
          touser: group.openid,
          templateId: TEMPLATE_ID,
          page: 'pages/today/today',  // 点击消息后跳转到首页
          data: {
            thing1: { value: `今日有 ${group.count} 项行动待完成` },
            thing2: { value: group.topActions.join('、') },
            date3: { value: todayDate }
          }
        })

        notifiedUsers++
        details.push({
          openid: group.openid,
          count: group.count,
          pushed: true,
          reason: '推送成功'
        })

        console.log('推送成功:', group.openid, group.count, '条')

      } catch (pushError) {
        // 推送失败不阻塞其他用户
        console.error('推送失败:', group.openid, pushError.message)
        details.push({
          openid: group.openid,
          count: group.count,
          pushed: false,
          reason: pushError.message || '推送接口调用失败'
        })
      }
    }

    console.log(`推送完成: ${notifiedUsers}/${userGroups.length} 位用户`)

    return {
      success: true,
      notifiedUsers,
      totalPending: actions.length,
      details
    }

  } catch (error) {
    console.error('scheduledPush 执行失败:', error)
    return {
      success: false,
      errMsg: error.message || '推送任务失败'
    }
  }
}

function getDateString(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
