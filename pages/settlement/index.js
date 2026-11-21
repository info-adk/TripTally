// pages/settlement/index.js
const app = getApp()

Page({
  data: {
    roomId: '',
    roomInfo: {},
    isLocked: false,
    // 展示已结算账目（含本次锁定与历史已结算房间）
    isSettledView: false,
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

    // 先读取房间信息，确定是否已锁定，再决定账目的查询范围
    this.loadRoomInfo().then(() => {
      return Promise.all([
        this.loadMembers(),
        this.loadExpenses()
      ])
    }).then(() => {
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
          this.setData({
            roomInfo: res.data,
            isLocked: !!(res.data && res.data.isLocked)
          })
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
    const db = wx.cloud.database()
    const roomId = this.data.roomId
    const _this = this

    // 分页获取房间全部账目（微信云数据库单次最多返回20条）
    // 这样才能兼容两类房间：本次改动后锁定的房间、以及此前已结算但没有锁定标记的老房间
    const MAX_LIMIT = 20

    const getPage = (skip) => {
      return new Promise((resolve, reject) => {
        db.collection('expenses')
          .where({ roomId })
          .orderBy('createdAt', 'desc')
          .skip(skip)
          .limit(MAX_LIMIT)
          .get({
            success: res => resolve(res.data || []),
            fail: err => reject(err)
          })
      })
    }

    // 先获取第一页
    return getPage(0).then(firstBatch => {
      if (firstBatch.length < MAX_LIMIT) {
        // 不足一页，没有更多数据
        _this.applyExpenses(firstBatch)
        return
      }

      // 继续获取后续页数据
      const promises = []
      for (let skip = MAX_LIMIT; skip < 2000; skip += MAX_LIMIT) {
        promises.push(getPage(skip))
      }

      return Promise.all(promises).then(batches => {
        let expenses = [...firstBatch]
        batches.forEach(batch => {
          if (batch && batch.length > 0) {
            expenses = expenses.concat(batch)
          }
        })
        _this.applyExpenses(expenses)
      })
    })
  },

  // 根据房间状态决定展示范围
  // 已锁定：展示全部账目
  // 未锁定且有新一轮待结算账目：只展示待结算账目
  // 未锁定但没有待结算、存在历史结算记录：按历史已结算展示全部账目
  applyExpenses: function(allExpenses) {
    const isLocked = this.data.isLocked
    let expenses = allExpenses
    let isSettledView = isLocked

    if (!isLocked) {
      const unsettled = allExpenses.filter(item => !item.isSettled)
      if (unsettled.length > 0) {
        expenses = unsettled
        isSettledView = false
      } else {
        isSettledView = allExpenses.length > 0
      }
    }

    this.setData({ expenses, isSettledView })
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
      balances[member.userName] = {
        userName: member.userName,
        paid: 0,
        shouldPay: 0,
        net: 0
      }
    })

    // 统计每人支付和应支付
    expenses.forEach(expense => {
      const payerName = expense.payerName
      const amount = Math.round(expense.amount * 100) / 100
      const participants = expense.participants || []
      const participantCount = participants.length || 1
      const perPerson = Math.round((amount / participantCount) * 100) / 100

      // 支付者增加支付额
      if (balances[payerName]) {
        balances[payerName].paid = Math.round((balances[payerName].paid + amount) * 100) / 100
      }

      // 参与者增加应支付额
      participants.forEach(participant => {
        if (balances[participant.userName]) {
          balances[participant.userName].shouldPay = Math.round((balances[participant.userName].shouldPay + perPerson) * 100) / 100
        }
      })
    })

    // 计算净额并保留两位小数
    Object.keys(balances).forEach(userName => {
      balances[userName].net = Math.round((balances[userName].paid - balances[userName].shouldPay) * 100) / 100
      balances[userName].paid = Math.round(balances[userName].paid * 100) / 100
      balances[userName].shouldPay = Math.round(balances[userName].shouldPay * 100) / 100
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

    Object.keys(balances).forEach(userName => {
      const net = balances[userName].net
      if (net > 0.01) {
        creditors.push({ userName: balances[userName].userName, amount: net })
      } else if (net < -0.01) {
        debtors.push({ userName: balances[userName].userName, amount: -net })
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
        fromUserName: debtor.userName,
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
    if (this.data.isLocked) {
      wx.showToast({
        title: '房间已结算锁定',
        icon: 'none'
      })
      return
    }

    const content = this.data.isSettledView
      ? '该房间已有结算记录。锁定后将不能再新增、修改或删除支出，账目会完整保留。'
      : '确认后房间将被锁定，不能再新增、修改或删除支出。账目会完整保留，可随时查看。'

    wx.showModal({
      title: this.data.isSettledView ? '锁定房间' : '确认结算',
      content,
      success: (res) => {
        if (res.confirm) {
          this.doSettlement()
        }
      }
    })
  },

  doSettlement: function() {
    wx.showLoading({ title: '结算中...' })

    // 交由云函数批量标记房间内全部未结算支出
    wx.cloud.callFunction({
      name: 'settleRoom',
      data: {
        roomId: this.data.roomId,
        userName: app.getUserInfo().userName
      },
      success: (res) => {
        wx.hideLoading()
        const result = res.result || {}
        if (!result.success) {
          wx.showToast({
            title: result.message || '结算失败',
            icon: 'error'
          })
          return
        }
        wx.showToast({
          title: this.data.isSettledView ? '锁定成功' : '结算成功',
          icon: 'success'
        })
        // 重新加载：房间已锁定，页面继续展示结算记录
        setTimeout(() => {
          this.loadData()
        }, 800)
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('结算失败:', err)
        wx.showToast({
          title: '结算失败',
          icon: 'error'
        })
      }
    })
  },

  onPullDownRefresh: function() {
    this.loadData()
    wx.stopPullDownRefresh()
  }
})