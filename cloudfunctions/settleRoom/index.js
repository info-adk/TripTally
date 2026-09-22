// 把房间内全部未结算支出标记为已结算
// 必须放在云函数中：小程序端不支持 where().update() 批量更新，逐条 doc().update()
// 既受单次查询 20 条限制、又受数据库写权限限制，且中途失败会留下部分结算的状态。
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const db = cloud.database()
  const { roomId, userName } = event

  if (!roomId) {
    return { success: false, message: '房间ID不能为空' }
  }

  if (!userName) {
    return { success: false, message: '用户信息不能为空' }
  }

  try {
    // 权限校验：仅房间活跃成员可确认结算
    const memberCheck = await db.collection('room_members')
      .where({
        roomId,
        userName,
        isActive: true
      })
      .count()

    if (memberCheck.total === 0) {
      return { success: false, message: '只有房间成员可以结算' }
    }

    // 统计待结算笔数
    const pending = await db.collection('expenses')
      .where({
        roomId,
        isSettled: false
      })
      .count()

    if (pending.total === 0) {
      return { success: true, updated: 0, pending: 0, message: '没有待结算支出' }
    }

    // 批量标记（云函数端批量更新不受单次 20 条限制）
    const updateResult = await db.collection('expenses')
      .where({
        roomId,
        isSettled: false
      })
      .update({
        data: {
          isSettled: true,
          settledAt: db.serverDate(),
          settledByName: userName
        }
      })

    return {
      success: true,
      updated: updateResult.stats.updated,
      pending: pending.total,
      message: '结算完成'
    }
  } catch (error) {
    console.error('结算失败:', error)
    return { success: false, message: '结算失败，请稍后重试' }
  }
}
