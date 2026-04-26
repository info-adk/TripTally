// cloudfunctions/createRoom/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 生成6位数字房间码
function generateRoomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// 云函数入口函数
exports.main = async (event, context) => {
  const db = cloud.database()
  const _ = db.command

  const { roomName, userId, userName, avatarUrl = '' } = event

  try {
    // 验证参数
    if (!userId || !userName || !userName.trim()) {
      return {
        success: false,
        message: '用户信息不完整，请重新进入小程序'
      }
    }

    // 生成唯一的房间码
    let roomCode
    let isUnique = false
    let attempts = 0
    const maxAttempts = 10

    while (!isUnique && attempts < maxAttempts) {
      roomCode = generateRoomCode()
      const checkResult = await db.collection('rooms')
        .where({ roomCode })
        .count()

      if (checkResult.total === 0) {
        isUnique = true
      } else {
        attempts++
      }
    }

    if (!isUnique) {
      return {
        success: false,
        message: '生成房间码失败，请稍后重试'
      }
    }

    // 创建房间记录
    const roomData = {
      roomCode,
      roomName,
      creatorId: userId,
      creatorName: userName,
      createdAt: db.serverDate(),
      memberCount: 1,
      maxMembers: 5,
      status: 'active',
      totalExpense: 0,
      settlementStatus: 'pending',
      lastCalculated: null
    }

    const roomResult = await db.collection('rooms').add({
      data: roomData
    })

    const roomId = roomResult._id

    // 添加创建者为房间成员
    const memberData = {
      roomId,
      userId,
      userName,
      avatarUrl,
      joinedAt: db.serverDate(),
      isActive: true,
      totalPaid: 0,
      totalShouldPay: 0
    }

    await db.collection('room_members').add({
      data: memberData
    })

    return {
      success: true,
      roomId,
      roomCode,
      roomName,
      message: '房间创建成功'
    }

  } catch (error) {
    console.error('创建房间失败:', error)
    return {
      success: false,
      message: '创建房间失败，请稍后重试'
    }
  }
}