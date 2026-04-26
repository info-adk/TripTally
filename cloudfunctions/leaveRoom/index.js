// cloudfunctions/leaveRoom/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
  const db = cloud.database()
  const _ = db.command

  const { roomId, userName } = event

  if (!roomId || !userName) {
    return {
      success: false,
      message: '参数错误'
    }
  }

  try {
    // 查找房间成员记录（用昵称查询）
    const memberResult = await db.collection('room_members')
      .where({ roomId, userName, isActive: true })
      .get()

    if (memberResult.data.length === 0) {
      return {
        success: false,
        message: '您不是该房间的活跃成员'
      }
    }

    const member = memberResult.data[0]
    const memberId = member._id

    // 将成员标记为非活跃
    await db.collection('room_members').doc(memberId).update({
      data: {
        isActive: false,
        leftAt: db.serverDate()
      }
    })

    // 更新房间成员数量
    await db.collection('rooms').doc(roomId).update({
      data: {
        memberCount: _.inc(-1)
      }
    })

    // 检查房间是否还有活跃成员
    const activeMembers = await db.collection('room_members')
      .where({ roomId, isActive: true })
      .count()

    // 如果没有活跃成员了，关闭房间
    if (activeMembers.total === 0) {
      await db.collection('rooms').doc(roomId).update({
        data: {
          status: 'closed'
        }
      })
    }

    return {
      success: true,
      message: '成功离开房间'
    }

  } catch (error) {
    console.error('离开房间失败:', error)
    return {
      success: false,
      message: '离开房间失败，请稍后重试'
    }
  }
}