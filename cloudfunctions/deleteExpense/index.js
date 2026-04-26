// cloudfunctions/deleteExpense/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
  const db = cloud.database()
  const _ = db.command

  const { expenseId, roomId, userName } = event

  // 参数验证
  if (!expenseId) {
    return { success: false, message: '支出ID不能为空' }
  }

  if (!roomId) {
    return { success: false, message: '房间ID不能为空' }
  }

  if (!userName || !userName.trim()) {
    return { success: false, message: '请输入昵称' }
  }

  try {
    // 获取支出详情
    const expenseResult = await db.collection('expenses').doc(expenseId).get()

    if (!expenseResult.data) {
      return { success: false, message: '支出记录不存在' }
    }

    const expense = expenseResult.data

    // 验证权限：只有支付者或房间创建者可以删除
    const roomResult = await db.collection('rooms').doc(roomId).get()

    if (!roomResult.data) {
      return { success: false, message: '房间不存在' }
    }

    const room = roomResult.data
    const isPayer = expense.payerName === userName
    const isCreator = room.creatorName === userName

    if (!isPayer && !isCreator) {
      return { success: false, message: '只有支付者或房间创建者可以删除' }
    }

    // 创建历史版本记录（删除前备份）
    const historyData = {
      expenseId,
      roomId,
      version: expense.version || 1,
      data: expense,
      operation: 'delete',
      operatedByName: userName,
      operatedAt: db.serverDate(),
      reason: '删除支出'
    }

    await db.collection('expense_history').add({
      data: historyData
    })

    // 删除支出记录
    await db.collection('expenses').doc(expenseId).remove()

    // 更新房间总支出
    await db.collection('rooms').doc(roomId).update({
      data: {
        totalExpense: _.inc(-expense.amount),
        lastUpdated: db.serverDate()
      }
    })

    // 更新支付者的总支付金额
    await db.collection('room_members')
      .where({ roomId, userName: expense.payerName })
      .update({
        data: {
          totalPaid: _.inc(-expense.amount)
        }
      })

    return {
      success: true,
      message: '支出记录删除成功'
    }

  } catch (error) {
    console.error('删除支出失败:', error)
    return {
      success: false,
      message: '删除支出失败，请稍后重试'
    }
  }
}