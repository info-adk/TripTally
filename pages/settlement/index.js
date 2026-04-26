// pages/settlement/index.js
const app = getApp()

Page({
  data: {
    roomId: '',
    roomInfo: {},
    expenses: [],
    members: [],
    totalAmount: 0,
    expenseCount: 0,
    balances: [],
    settlement: [],
    isLoading: true
  },

  onLoad: function(options) {
    const { roomId } = options
    if (!roomId) {
      wx.showToast({
        title: '参数错误',
        icon: 'error'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }

    this.setData({ roomId })
    this.loadData()
  },

  loadData: function() {
    this.setData({ isLoading: true })

    Promise.all([
      this.loadRoomInfo(),
      this.loadMembers(),
      this.loadExpenses()
    ]).then(() => {
      this.calculateSettlement()
      this.setData({ isLoading: false })
    }).catch(err => {
      console.error('加载数据失败:', err)
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      })
      this.setData({ isLoading: false })
    })
  },

  loadRoomInfo: function() {
    return new Promise((resolve, reject) => {
      const db = wx.cloud.database()
      db.collection('rooms').doc(this.data.roomId).get({
        success: (res) => {
          this.setData({ roomInfo: res.data })
          resolve()
        },
        fail: reject
      })
    })
  },

  loadMembers: function() {
    return new Promise((resolve, reject) => {
      const db = wx.cloud.database()
      db.collection('room_members')
        .where({
          roomId: this.data.roomId,
          isActive: true
        })
        .get({
          success: (res) => {
            this.setData({ members: res.data })
            resolve()
          },
          fail: reject
        })
    })
  },

  loadExpenses: function() {
    return new Promise((resolve, reject) => {
      const db = wx.cloud.database()
      db.collection('expenses')
        .where({
          roomId: this.data.roomId,
          isSettled: false
        })
        .get({
          success: (res) => {
            this.setData({ expenses: res.data })
            resolve()
          },
          fail: reject
        })
    })
  },

  calculateSettlement: function() {
    const { expenses, members } = this.data

    if (expenses.length === 0 || members.length === 0) {
      this.setData({
        totalAmount: 0,
        expenseCount: 0,
        balances: [],
        settlement: []
      })
      return
    }

    // 计算总支出
    let totalAmount = 0
    expenses.forEach(expense => {
      totalAmount += expense.amount
    })

    // 初始化每人收支
    const balances = {}
    members.forEach(member => {
      balances[member.userId] = {
        userId: member.userId,
        userName: member.userName,
        paid: 0,
        shouldPay: 0,
        net: 0
      }
    })

    // 统计每人支付和应支付
    expenses.forEach(expense => {
      const payerId = expense.payerId
      const amount = expense.amount
      const participants = expense.participants || []
      const participantCount = participants.length || 1
      const perPerson = amount / participantCount

      // 支付者增加支付额
      if (balances[payerId]) {
        balances[payerId].paid += amount
      }

      // 参与者增加应支付额
      participants.forEach(participant => {
        if (balances[participant.userId]) {
          balances[participant.userId].shouldPay += perPerson
        }
      })
    })

    // 计算净额并保留两位小数
    Object.keys(balances).forEach(userId => {
      balances[userId].net = Math.round((balances[userId].paid - balances[userId].shouldPay) * 100) / 100
      balances[userId].paid = Math.round(balances[userId].paid * 100) / 100
      balances[userId].shouldPay = Math.round(balances[userId].shouldPay * 100) / 100
    })

    // 生成结算方案
    const settlement = this.generateSettlement(balances)

    this.setData({
      totalAmount: Math.round(totalAmount * 100) / 100,
      expenseCount: expenses.length,
      balances: Object.values(balances),
      settlement
    })
  },

  generateSettlement: function(balances) {
    const creditors = []
    const debtors = []

    Object.keys(balances).forEach(userId => {
      const net = balances[userId].net
      if (net > 0.01) {
        creditors.push({ userId, userName: balances[userId].userName, amount: net })
      } else if (net < -0.01) {
        debtors.push({ userId, userName: balances[userId].userName, amount: -net })
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

      settlements.push({
        fromUserId: debtor.userId,
        fromUserName: debtor.userName,
        toUserId: creditor.userId,
        toUserName: creditor.userName,
        amount: Math.round(settleAmount * 100) / 100
      })

      creditor.amount -= settleAmount
      debtor.amount -= settleAmount

      if (creditor.amount < 0.01) i++
      if (debtor.amount < 0.01) j++
    }

    return settlements
  },

  onConfirmSettlement: function() {
    wx.showModal({
      title: '确认结算',
      content: '确定要确认结算吗？结算后将标记所有待结算支出为已结算。',
      success: (res) => {
        if (res.confirm) {
          this.doSettlement()
        }
      }
    })
  },

  doSettlement: function() {
    wx.showLoading({ title: '结算中...' })

    const { expenses } = this.data
    const expenseIds = expenses.map(e => e._id)

    const db = wx.cloud.database()
    const _ = db.command

    // 批量更新支出为已结算
    const batchUpdate = expenseIds.map(id => {
      return db.collection('expenses').doc(id).update({
        data: {
          isSettled: true,
          settledAt: new Date(),
          settledBy: app.getUserInfo().userId
        }
      })
    })

    Promise.all(batchUpdate).then(() => {
      wx.hideLoading()
      wx.showToast({
        title: '结算成功',
        icon: 'success'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }).catch(err => {
      wx.hideLoading()
      console.error('结算失败:', err)
      wx.showToast({
        title: '结算失败',
        icon: 'error'
      })
    })
  },

  onPullDownRefresh: function() {
    this.loadData()
    wx.stopPullDownRefresh()
  }
})