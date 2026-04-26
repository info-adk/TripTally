// cloudfunctions/restoreFromHistory/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
  const db = cloud.database()
  const _ = db.command

  const { versionId, expenseId, userName } = event

  if (!versionId && !expenseId) {
    return { success: false, message: '需要提供versionId或expenseId' }
  }

  if (!userName || !userName.trim()) {
    return { success: false, message: '请输入昵称' }
  }

  try {
    // 获取历史记录
    let historyRecord
    if (versionId) {
      const historyResult = await db.collection('expense_history')
        .doc(versionId)
        .get()
      historyRecord = historyResult.data
    } else {
      // 获取指定支出的最新历史记录
      const historyResult = await db.collection('expense_history')
        .where({ expenseId })
        .orderBy('version', 'desc')
        .limit(1)
        .get()
      historyRecord = historyResult.data[0]
    }

    if (!historyRecord) {
      return { success: false, message: '历史记录不存在' }
    }

    const { roomId, data: expenseData, operation } = historyRecord

    // 验证操作权限
    const memberCheck = await db.collection('room_members')
      .where({ roomId, userName, isActive: true })
      .count()

    if (memberCheck.total === 0) {
      return { success: false, message: '无权恢复此记录' }
    }

    // 检查是否是房间创建者或支付者
    const roomResult = await db.collection('rooms')
      .doc(roomId)
      .get()
    const room = roomResult.data

    const isCreator = room.creatorName === userName
    const isPayer = expenseData.payerName === userName

    if (!isCreator && !isPayer) {
      return { success: false, message: '只有房间创建者或支付者可以恢复记录' }
    }

    // 恢复数据
    if (operation === 'delete') {
      // 恢复被删除的记录
      const restoredExpense = {
        ...expenseData,
        updatedAt: db.serverDate(),
        isDeleted: false
      }

      // 检查记录是否已存在
      const existingCheck = await db.collection('expenses')
        .doc(expenseData._id)
        .get()

      if (existingCheck.data) {
        // 更新现有记录
        await db.collection('expenses')
          .doc(expenseData._id)
          .update({
            data: restoredExpense
          })
      } else {
        // 创建新记录
        await db.collection('expenses').add({
          data: {
            ...restoredExpense,
            _id: expenseData._id,
            createdAt: db.serverDate()
          }
        })
      }

    } else {
      // 恢复历史版本数据
      const restoredExpense = {
        ...expenseData,
        updatedAt: db.serverDate()
      }

      await db.collection('expenses')
        .doc(expenseData._id)
        .update({
          data: restoredExpense
        })
    }

    // 创建恢复操作的历史记录
    const restoreHistoryData = {
      expenseId: expenseData._id,
      roomId,
      version: historyRecord.version + 1,
      data: expenseData,
      operation: 'restore',
      operatedByName: userName,
      operatedAt: db.serverDate(),
      reason: `从版本 ${historyRecord.version} 恢复`
    }

    await db.collection('expense_history').add({
      data: restoreHistoryData
    })

    // 触发AA重新计算
    try {
      await cloud.callFunction({
        name: 'calculateSettlement',
        data: { roomId }
      })
    } catch (calcError) {
      console.error('触发AA计算失败:', calcError)
      // 不影响恢复操作
    }

    return {
      success: true,
      expenseId: expenseData._id,
      version: restoreHistoryData.version,
      message: '数据恢复成功'
    }

  } catch (error) {
    console.error('恢复数据失败:', error)
    return {
      success: false,
      message: '恢复数据失败'
    }
  }
}