// cloudfunctions/updateExpense/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
  const db = cloud.database()
  const _ = db.command

  const {
    expenseId,
    roomId,
    amount,
    category,
    description,
    payerId,
    payerName,
    date,
    participants,
    userId,
    userName = '用户'
  } = event

  // 参数验证
  if (!expenseId) {
    return { success: false, message: '支出ID不能为空' }
  }

  if (!roomId) {
    return { success: false, message: '房间ID不能为空' }
  }

  if (!amount || amount <= 0) {
    return { success: false, message: '金额必须大于0' }
  }

  if (!participants || participants.length === 0) {
    return { success: false, message: '请选择参与人' }
  }

  try {
    // 获取支出详情
    const expenseResult = await db.collection('expenses').doc(expenseId).get()

    if (!expenseResult.data) {
      return { success: false, message: '支出记录不存在' }
    }

    const oldExpense = expenseResult.data

    // 验证权限：只有支付者或房间创建者可以编辑
    const roomResult = await db.collection('rooms').doc(roomId).get()

    if (!roomResult.data) {
      return { success: false, message: '房间不存在' }
    }

    const room = roomResult.data
    const isPayer = oldExpense.payerId === userId
    const isCreator = room.creatorId === userId

    if (!isPayer && !isCreator) {
      return { success: false, message: '只有支付者或房间创建者可以编辑' }
    }

    // 创建历史版本记录（更新前备份）
    const historyData = {
      expenseId,
      roomId,
      version: oldExpense.version || 1,
      data: oldExpense,
      operation: 'update',
      operatedBy: userId,
      operatedByName: userName,
      operatedAt: db.serverDate(),
      reason: '编辑支出'
    }

    await db.collection('expense_history').add({
      data: historyData
    })

    // 计算金额差异
    const amountDiff = amount - oldExpense.amount

    // 更新支出记录
    const updateData = {
      amount: parseFloat(amount.toFixed(2)),
      category,
      description: description || '无备注',
      payerId,
      payerName,
      date,
      participants,
      updatedAt: db.serverDate(),
      updatedBy: userId,
      updatedByName: userName,
      version: (oldExpense.version || 1) + 1
    }

    await db.collection('expenses').doc(expenseId).update({
      data: updateData
    })

    // 更新房间总支出（如果有差异）
    if (amountDiff !== 0) {
      await db.collection('rooms').doc(roomId).update({
        data: {
          totalExpense: _.inc(amountDiff),
          lastUpdated: db.serverDate()
        }
      })

      // 更新旧支付者和新支付者的总支付金额
      if (oldExpense.payerId !== payerId) {
        // 旧支付者减去旧金额
        await db.collection('room_members')
          .where({ roomId, userId: oldExpense.payerId })
          .update({
            data: {
              totalPaid: _.inc(-oldExpense.amount)
            }
          })
        // 新支付者加上新金额
        await db.collection('room_members')
          .where({ roomId, userId: payerId })
          .update({
            data: {
              totalPaid: _.inc(amount)
            }
          })
      } else {
        // 同一支付者，调整金额
        await db.collection('room_members')
          .where({ roomId, userId: payerId })
          .update({
            data: {
              totalPaid: _.inc(amountDiff)
            }
          })
      }
    }

    return {
      success: true,
      message: '支出记录更新成功'
    }

  } catch (error) {
    console.error('更新支出失败:', error)
    return {
      success: false,
      message: '更新支出失败，请稍后重试'
    }
  }
}