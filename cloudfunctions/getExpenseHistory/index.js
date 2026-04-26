// cloudfunctions/getExpenseHistory/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
  const db = cloud.database()
  const _ = db.command

  const { expenseId, roomId, userName, limit = 20, offset = 0 } = event

  try {
    // 构建查询条件
    let query = db.collection('expense_history')

    if (expenseId) {
      query = query.where({ expenseId })
    } else if (roomId) {
      // 验证用户是否是房间成员（用昵称判断）
      const memberCheck = await db.collection('room_members')
        .where({ roomId, userName, isActive: true })
        .count()

      if (memberCheck.total === 0) {
        return { success: false, message: '无权查看此房间的历史记录' }
      }

      query = query.where({ roomId })
    } else {
      return { success: false, message: '需要提供expenseId或roomId' }
    }

    // 获取历史记录
    const historyResult = await query
      .orderBy('version', 'desc')
      .skip(offset)
      .limit(limit)
      .get()

    // 获取总数（用于分页）
    const countResult = await query.count()

    // 处理数据，便于前端显示
    const processedHistory = historyResult.data.map(record => ({
      _id: record._id,
      expenseId: record.expenseId,
      roomId: record.roomId,
      version: record.version,
      operation: record.operation,
      operatedBy: record.operatedBy,
      operatedByName: record.operatedByName,
      operatedAt: record.operatedAt,
      reason: record.reason,
      // 从data中提取关键信息显示
      amount: record.data?.amount || 0,
      category: record.data?.category || '',
      description: record.data?.description || '',
      payerName: record.data?.payerName || '未知',
      date: record.data?.date || '',
      participantCount: record.data?.participants?.length || 0
    }))

    return {
      success: true,
      data: {
        history: processedHistory,
        total: countResult.total,
        limit,
        offset
      },
      message: '获取历史记录成功'
    }

  } catch (error) {
    console.error('获取历史记录失败:', error)
    return {
      success: false,
      message: '获取历史记录失败'
    }
  }
}