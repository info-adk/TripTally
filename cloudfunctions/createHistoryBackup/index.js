// cloudfunctions/createHistoryBackup/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
  const db = cloud.database()

  const { expenseId, userName, operation, reason = '' } = event

  if (!expenseId || !operation) {
    return { success: false, message: '参数不完整' }
  }

  if (!userName || !userName.trim()) {
    return { success: false, message: '请输入昵称' }
  }

  try {
    // 获取支出记录
    const expenseResult = await db.collection('expenses')
      .doc(expenseId)
      .get()

    if (!expenseResult.data) {
      return { success: false, message: '支出记录不存在' }
    }

    const expense = expenseResult.data
    const roomId = expense.roomId

    // 验证操作权限
    const userCheck = await db.collection('room_members')
      .where({ roomId, userName, isActive: true })
      .count()

    if (userCheck.total === 0) {
      return { success: false, message: '无权操作此记录' }
    }

    // 获取当前版本号
    const versionResult = await db.collection('expense_history')
      .where({ expenseId })
      .orderBy('version', 'desc')
      .limit(1)
      .get()

    const currentVersion = versionResult.data.length > 0
      ? versionResult.data[0].version + 1
      : 1

    // 创建历史版本记录
    const historyData = {
      expenseId,
      roomId,
      version: currentVersion,
      data: expense,
      operation, // create/update/delete
      operatedByName: userName,
      operatedAt: db.serverDate(),
      reason
    }

    await db.collection('expense_history').add({
      data: historyData
    })

    return {
      success: true,
      version: currentVersion,
      message: '历史版本创建成功'
    }

  } catch (error) {
    console.error('创建历史备份失败:', error)
    return {
      success: false,
      message: '创建历史备份失败'
    }
  }
}