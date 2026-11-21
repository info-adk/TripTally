// 确认结算：把房间内全部未结算支出标记为已结算，并锁定房间。
// 锁定后各写操作云函数会拒绝新增/修改/删除，账目数据本身完整保留，可继续查看。
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
    // 校验房间存在
    const roomResult = await db.collection('rooms').doc(roomId).get()
    if (!roomResult.data) {
      return { success: false, message: '房间不存在' }
    }
    const room = roomResult.data

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

    // 已锁定则幂等返回，避免重复结算
    if (room.isLocked) {
      return { success: true, updated: 0, pending: 0, locked: true, message: '房间已结算锁定' }
    }

    // 统计待结算笔数
    const pending = await db.collection('expenses')
      .where({
        roomId,
        isSettled: false
      })
      .count()

    // 批量标记（云函数端批量更新不受单次 20 条限制）
    let updated = 0
    if (pending.total > 0) {
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
      updated = updateResult.stats.updated
    }

    // 锁定房间：数据保留，但不再允许任何写操作
    await db.collection('rooms').doc(roomId).update({
      data: {
        isLocked: true,
        lockedAt: db.serverDate(),
        lockedByName: userName,
        settlementStatus: 'settled',
        lastUpdated: db.serverDate()
      }
    })

    return {
      success: true,
      updated,
      pending: pending.total,
      locked: true,
      message: '结算完成，房间已锁定'
    }
  } catch (error) {
    console.error('结算失败:', error)
    return { success: false, message: '结算失败，请稍后重试' }
  }
}
