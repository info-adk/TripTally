// 云函数名称：updateUserNickname
// 功能：同步更新云数据库中所有使用旧昵称的文档

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { oldNickname, newNickname } = event

  if (!oldNickname || !newNickname) {
    return {
      success: false,
      message: '缺少旧昵称或新昵称'
    }
  }

  console.log(`开始同步昵称: ${oldNickname} -> ${newNickname}`)

  try {
    // 1. 更新 rooms 集合中的 creatorName
    const roomsRes = await db.collection('rooms').where({
      creatorName: oldNickname
    }).update({
      data: {
        creatorName: newNickname
      }
    })
    console.log('更新 rooms:', roomsRes)

    // 2. 更新 room_members 集合中的 userName
    const membersRes = await db.collection('room_members').where({
      userName: oldNickname
    }).update({
      data: {
        userName: newNickname
      }
    })
    console.log('更新 room_members:', membersRes)

    // 3. 更新 expenses 集合中的 payerName
    const expensesPayerRes = await db.collection('expenses').where({
      payerName: oldNickname
    }).update({
      data: {
        payerName: newNickname
      }
    })
    console.log('更新 expenses payerName:', expensesPayerRes)

    // 4. 更新 expenses 集合中的 createdByName
    const expensesCreatorRes = await db.collection('expenses').where({
      createdByName: oldNickname
    }).update({
      data: {
        createdByName: newNickname
      }
    })
    console.log('更新 expenses createdByName:', expensesCreatorRes)

    // 5. 更新 expense_history 集合中的 userName
    const historyUserRes = await db.collection('expense_history').where({
      userName: oldNickname
    }).update({
      data: {
        userName: newNickname
      }
    })
    console.log('更新 expense_history userName:', historyUserRes)

    // 6. 更新 expense_history 集合中的 createdByName
    const historyCreatorRes = await db.collection('expense_history').where({
      createdByName: oldNickname
    }).update({
      data: {
        createdByName: newNickname
      }
    })
    console.log('更新 expense_history createdByName:', historyCreatorRes)

    return {
      success: true,
      message: '昵称同步完成',
      stats: {
        rooms: roomsRes.stats.updated,
        room_members: membersRes.stats.updated,
        expensesPayer: expensesPayerRes.stats.updated,
        expensesCreator: expensesCreatorRes.stats.updated,
        historyUser: historyUserRes.stats.updated,
        historyCreator: historyCreatorRes.stats.updated
      }
    }
  } catch (err) {
    console.error('昵称同步失败:', err)
    return {
      success: false,
      message: '昵称同步失败: ' + err.message
    }
  }
}