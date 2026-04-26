// cloudfunctions/addExpense/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
  const db = cloud.database()
  const _ = db.command

  const {
    roomId,
    userName,
    amount,
    category = '其他',
    description = '',
    participants = []
  } = event

  // 参数验证
  if (!roomId) {
    return { success: false, message: '房间ID不能为空' }
  }

  if (!userName || !userName.trim()) {
    return { success: false, message: '请输入昵称' }
  }

  if (!amount || amount <= 0) {
    return { success: false, message: '金额必须大于0' }
  }

  try {
    // 验证房间是否存在且用户是成员
    const roomCheck = await db.collection('rooms')
      .doc(roomId)
      .get()

    if (!roomCheck.data) {
      return { success: false, message: '房间不存在' }
    }

    const memberCheck = await db.collection('room_members')
      .where({ roomId, userName, isActive: true })
      .count()

    if (memberCheck.total === 0) {
      return { success: false, message: '您不是该房间成员' }
    }

    // 处理参与人员（如果未指定，默认房间所有成员）
    let finalParticipants = participants
    if (!finalParticipants || finalParticipants.length === 0) {
      const membersResult = await db.collection('room_members')
        .where({ roomId, isActive: true })
        .field({ userName: true })
        .get()
      finalParticipants = membersResult.data.map(member => ({
        userName: member.userName,
        avatarUrl: member.avatarUrl || ''
      }))
    } else {
      // 验证参与人员是否都是房间成员
      const participantNames = finalParticipants.map(p => p.userName)
      const participantsCheck = await db.collection('room_members')
        .where({
          roomId,
          userName: _.in(participantNames),
          isActive: true
        })
        .count()

      if (participantsCheck.total !== finalParticipants.length) {
        return { success: false, message: '部分参与人员不是房间成员' }
      }

      // 获取参与人员信息
      const participantsInfo = await db.collection('room_members')
        .where({
          roomId,
          userName: _.in(participantNames),
          isActive: true
        })
        .field({ userName: true })
        .get()

      finalParticipants = participantsInfo.data
    }

    // 创建支出记录
    const expenseData = {
      roomId,
      payerName: userName,
      createdByName: userName,
      amount: parseFloat(amount.toFixed(2)),
      category,
      description,
      date: new Date().toISOString().split('T')[0], // YYYY-MM-DD格式
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
      participants: finalParticipants,
      isSettled: false,
      version: 1
    }

    const expenseResult = await db.collection('expenses').add({
      data: expenseData
    })

    const expenseId = expenseResult._id

    // 创建历史版本记录
    const historyData = {
      expenseId,
      roomId,
      version: 1,
      data: expenseData,
      operation: 'create',
      operatedByName: userName,
      operatedAt: db.serverDate(),
      reason: '新增支出'
    }

    await db.collection('expense_history').add({
      data: historyData
    })

    // 更新房间总支出
    await db.collection('rooms').doc(roomId).update({
      data: {
        totalExpense: _.inc(amount),
        lastUpdated: db.serverDate()
      }
    })

    // 更新支付者的总支付金额
    await db.collection('room_members')
      .where({ roomId, userName })
      .update({
        data: {
          totalPaid: _.inc(amount)
        }
      })

    // 触发AA计算（异步）
    try {
      await cloud.callFunction({
        name: 'calculateSettlement',
        data: { roomId }
      })
    } catch (calcError) {
      console.error('触发AA计算失败:', calcError)
      // 不影响主要操作，继续执行
    }

    return {
      success: true,
      expenseId,
      message: '支出记录添加成功'
    }

  } catch (error) {
    console.error('添加支出失败:', error)
    return {
      success: false,
      message: '添加支出失败，请稍后重试'
    }
  }
}