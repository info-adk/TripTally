// cloudfunctions/joinRoom/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
  const db = cloud.database()
  const _ = db.command

  const { roomCode, userId, userName = '用户', avatarUrl = '' } = event

  if (!roomCode || roomCode.length !== 6) {
    return {
      success: false,
      message: '请输入6位房间码'
    }
  }

  try {
    // 查找房间
    const roomResult = await db.collection('rooms')
      .where({ roomCode, status: 'active' })
      .get()

    if (roomResult.data.length === 0) {
      return {
        success: false,
        message: '房间不存在或已关闭'
      }
    }

    const room = roomResult.data[0]
    const roomId = room._id

    // 检查是否已满员
    if (room.memberCount >= room.maxMembers) {
      return {
        success: false,
        message: '房间已满员（最多5人）'
      }
    }

    // 检查是否已经是成员
    const memberCheck = await db.collection('room_members')
      .where({ roomId, userId, isActive: true })
      .count()

    if (memberCheck.total > 0) {
      return {
        success: true,
        roomId,
        roomCode,
        roomName: room.roomName,
        message: '您已经是房间成员'
      }
    }

    // 添加为新成员
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

    // 更新房间成员数量
    await db.collection('rooms').doc(roomId).update({
      data: {
        memberCount: _.inc(1)
      }
    })

    return {
      success: true,
      roomId,
      roomCode,
      roomName: room.roomName,
      message: '成功加入房间'
    }

  } catch (error) {
    console.error('加入房间失败:', error)
    return {
      success: false,
      message: '加入房间失败，请稍后重试'
    }
  }
}