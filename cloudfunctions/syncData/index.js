// cloudfunctions/syncData/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
  const db = cloud.database()
  const _ = db.command

  const { roomId, lastSyncTime } = event

  if (!roomId) {
    return { success: false, message: '房间ID不能为空' }
  }

  try {
    // 获取自上次同步以来的变更
    const syncTime = lastSyncTime ? new Date(lastSyncTime) : new Date(0)

    // 1. 获取房间信息
    const roomResult = await db.collection('rooms')
      .doc(roomId)
      .get()

    if (!roomResult.data) {
      return { success: false, message: '房间不存在' }
    }

    // 2. 获取成员列表
    const membersResult = await db.collection('room_members')
      .where({ roomId, isActive: true })
      .get()

    // 3. 获取支出记录（自上次同步后新增或修改的）
    const expensesQuery = db.collection('expenses')
      .where({ roomId })

    if (lastSyncTime) {
      expensesQuery.where(_.or([
        { createdAt: _.gt(syncTime) },
        { updatedAt: _.gt(syncTime) }
      ]))
    }

    const expensesResult = await expensesQuery
      .orderBy('createdAt', 'desc')
      .get()

    // 4. 获取最新的结算信息
    const settlementResult = await db.collection('settlements')
      .where({ roomId })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get()

    // 5. 获取删除的记录（通过历史版本）
    const deletedExpenses = await db.collection('expense_history')
      .where({
        roomId,
        operation: 'delete',
        operatedAt: _.gt(syncTime)
      })
      .get()

    return {
      success: true,
      data: {
        room: roomResult.data,
        members: membersResult.data,
        expenses: expensesResult.data,
        latestSettlement: settlementResult.data[0] || null,
        deletedExpenses: deletedExpenses.data.map(h => h.expenseId),
        syncTime: new Date().toISOString()
      },
      message: '数据同步完成'
    }

  } catch (error) {
    console.error('数据同步失败:', error)
    return {
      success: false,
      message: '数据同步失败，请稍后重试'
    }
  }
}