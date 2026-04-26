// cloudfunctions/calculateSettlement/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// AA计算核心算法
function calculateAA(expenses, members) {
  // 1. 初始化每人收支
  const balances = {}
  members.forEach(member => {
    balances[member.userName] = {
      paid: 0,
      shouldPay: 0,
      net: 0,
      userName: member.userName
    }
  })

  // 2. 统计每人支付和应支付
  expenses.forEach(expense => {
    const payerName = expense.payerName
    const amount = Math.round(expense.amount * 100) / 100  // 保留2位小数
    const participantCount = expense.participants.length
    const perPerson = Math.round((amount / participantCount) * 100) / 100  // 保留2位小数

    // 支付者增加支付额
    if (balances[payerName]) {
      balances[payerName].paid = Math.round((balances[payerName].paid + amount) * 100) / 100
    }

    // 参与者增加应支付额
    expense.participants.forEach(participant => {
      if (balances[participant.userName]) {
        balances[participant.userName].shouldPay = Math.round((balances[participant.userName].shouldPay + perPerson) * 100) / 100
      }
    })
  })

  // 3. 计算净额
  Object.keys(balances).forEach(userName => {
    balances[userName].net = Math.round((balances[userName].paid - balances[userName].shouldPay) * 100) / 100
  })

  return balances
}

// 生成最少转账的结算方案
function generateSettlement(balances) {
  const creditors = []
  const debtors = []

  Object.keys(balances).forEach(userName => {
    const balance = balances[userName]
    if (balance.net > 0) {
      creditors.push({
        userName: balance.userName,
        amount: balance.net
      })
    } else if (balance.net < 0) {
      debtors.push({
        userName: balance.userName,
        amount: -balance.net
      })
    }
  })

  // 排序：金额大的优先
  creditors.sort((a, b) => b.amount - a.amount)
  debtors.sort((a, b) => b.amount - a.amount)

  const settlements = []
  let i = 0, j = 0

  while (i < creditors.length && j < debtors.length) {
    const creditor = creditors[i]
    const debtor = debtors[j]
    const settleAmount = Math.min(creditor.amount, debtor.amount)

    if (settleAmount > 0.01) { // 忽略小于1分钱的转账
      settlements.push({
        fromUserName: debtor.userName,
        toUserName: creditor.userName,
        amount: parseFloat(settleAmount.toFixed(2))
      })
    }

    creditor.amount -= settleAmount
    debtor.amount -= settleAmount

    if (creditor.amount < 0.01) i++
    if (debtor.amount < 0.01) j++
  }

  return settlements
}

// 云函数入口函数
exports.main = async (event, context) => {
  const db = cloud.database()
  const _ = db.command

  const { roomId } = event

  if (!roomId) {
    return { success: false, message: '房间ID不能为空' }
  }

  try {
    // 1. 查询房间所有未结算的支出
    const expensesResult = await db.collection('expenses')
      .where({
        roomId,
        isSettled: false
      })
      .get()

    // 2. 查询房间所有活跃成员
    const membersResult = await db.collection('room_members')
      .where({
        roomId,
        isActive: true
      })
      .field({
        userName: true
      })
      .get()

    if (membersResult.data.length === 0) {
      return {
        success: false,
        message: '房间没有成员'
      }
    }

    // 3. 计算AA
    const expenses = expensesResult.data
    const members = membersResult.data
    const balances = calculateAA(expenses, members)

    // 4. 生成结算方案
    const settlements = generateSettlement(balances)

    // 5. 计算总支出和人均应付
    const totalExpense = expenses.reduce((sum, expense) => sum + expense.amount, 0)
    const averageExpense = totalExpense / members.length

    // 6. 更新成员余额信息
    const updatePromises = members.map(member => {
      const balance = balances[member.userName] || { paid: 0, shouldPay: 0, net: 0 }
      return db.collection('room_members')
        .where({ roomId, userName: member.userName })
        .update({
          data: {
            totalPaid: balance.paid,
            totalShouldPay: balance.shouldPay,
            balance: balance.net,
            lastCalculated: db.serverDate()
          }
        })
    })

    await Promise.all(updatePromises)

    // 7. 创建结算记录
    const settlementData = {
      roomId,
      createdAt: db.serverDate(),
      totalAmount: parseFloat(totalExpense.toFixed(2)),
      averageAmount: parseFloat(averageExpense.toFixed(2)),
      memberCount: members.length,
      expenseCount: expenses.length,
      balances: Object.keys(balances).map(userName => ({
        userName: balances[userName].userName,
        paid: parseFloat(balances[userName].paid.toFixed(2)),
        shouldPay: parseFloat(balances[userName].shouldPay.toFixed(2)),
        net: parseFloat(balances[userName].net.toFixed(2))
      })),
      settlements: settlements,
      calculatedBy: 'system',
      version: 1
    }

    const settlementResult = await db.collection('settlements').add({
      data: settlementData
    })

    // 8. 更新房间结算状态
    await db.collection('rooms').doc(roomId).update({
      data: {
        settlementStatus: 'calculated',
        lastCalculated: db.serverDate(),
        currentSettlementId: settlementResult._id
      }
    })

    return {
      success: true,
      settlementId: settlementResult._id,
      totalExpense: parseFloat(totalExpense.toFixed(2)),
      averageExpense: parseFloat(averageExpense.toFixed(2)),
      balances: settlementData.balances,
      settlements: settlements,
      message: 'AA计算完成'
    }

  } catch (error) {
    console.error('AA计算失败:', error)
    return {
      success: false,
      message: 'AA计算失败，请稍后重试'
    }
  }
}