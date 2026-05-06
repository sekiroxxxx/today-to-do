// 云函数入口文件
const cloud = require('wx-server-sdk')

// 初始化云开发环境
// 注意：cloud.DYNAMIC_CURRENT_ENVIRONMENT 表示使用当前云函数所在的环境
// 不需要手动填写环境 ID，部署后会自动识别
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENVIRONMENT })

// 获取数据库引用
const db = cloud.database()

/**
 * login 云函数
 *
 * 【功能说明】
 * 这是用户登录的入口函数。每次用户打开小程序时调用一次。
 * 它做的事情很简单：
 *   1. 从微信上下文获取用户的唯一标识 openid
 *   2. 去 users 集合里查这个 openid 有没有记录
 *   3. 有 → 返回已有用户信息
 *   4. 没有 → 创建一条新记录（新用户），返回新用户信息
 *
 * 【调用方式（前端）】
 * wx.cloud.callFunction({ name: 'login', data: {} })
 *   .then(res => {
 *     console.log(res.result) // { user: { _openid, nickname, avatar, preferences, createdAt } }
 *   })
 *
 * 【入参】
 * 无。所有信息从微信上下文获取，前端不需要传任何参数。
 *
 * 【出参】
 * {
 *   user: {
 *     _id: string,           // 数据库记录 ID
 *     _openid: string,       // 微信用户唯一标识
 *     nickname: string,      // 昵称（新用户默认为空字符串）
 *     avatar: string,        // 头像 URL（新用户默认为空字符串）
 *     preferences: {         // 用户偏好设置
 *       dailyLimit: 5,       // 每日清单数量上限，默认 5 条
 *       pushEnabled: false   // 是否开启消息推送，默认关闭
 *     },
 *     createdAt: Date        // 账号创建时间
 *   }
 * }
 */
exports.main = async (event, context) => {
  // ========== 第1步：获取用户的 openid ==========
  // wx.getWXContext() 是云函数特有的方法，能拿到调用者的微信身份信息
  // 每个微信用户在每个小程序里的 openid 是唯一的
  // 不需要用户授权，云函数天然能拿到这个值
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  // ========== 第2步：在数据库里查找这个用户 ==========
  // users 是集合名（对应你在云开发控制台创建的 users 集合）
  // .where() 相当于 SQL 的 WHERE 条件
  // _openid 是微信云开发自动添加的字段，记录每条数据属于哪个用户
  // 但我们还没创建记录，所以用自己的 openid 字段来查
  try {
    const userResult = await db.collection('users').where({
      _openid: openid
    }).get()

    // ========== 第3步：分两种情况处理 ==========

    // 情况A：找到了 — 老用户，直接返回已有记录
    // .get() 返回的 data 是一个数组，即使只有一条也是数组
    if (userResult.data.length > 0) {
      console.log('老用户登录:', openid)
      return {
        user: userResult.data[0]  // 取第一条（理论上只会有一条）
      }
    }

    // 情况B：没找到 — 新用户，创建一条记录再返回
    console.log('新用户注册:', openid)
    const newUser = {
      // _openid 字段：微信云开发要求手动写入，用于权限校验
      // 虽然云函数有全部权限，但为了数据一致性，写入 _openid
      _openid: openid,
      nickname: '',
      avatar: '',
      persona: '',             // 用户画像（v1.1 启用）
      preferences: {
        dailyLimit: 5,
        pushEnabled: false
      },
      createdAt: db.serverDate()
    }

    // .add() 把数据写入数据库，返回的 _id 是自动生成的唯一 ID
    const addResult = await db.collection('users').add({
      data: newUser
    })

    // 把自动生成的 _id 也放到返回数据里，前端可能会用到
    newUser._id = addResult._id

    return {
      user: newUser
    }

  } catch (error) {
    // ========== 错误处理 ==========
    // 如果数据库操作失败（比如集合不存在、网络超时等），
    // 打印详细错误信息到云函数日志，方便排查
    console.error('login 云函数执行失败:', error)
    return {
      success: false,
      errMsg: error.message || '登录失败，请稍后重试'
    }
  }
}
