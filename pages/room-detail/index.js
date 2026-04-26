// pages/room-detail/index.js
const app = getApp()

Page({
  data: {
    roomId: '',
    roomInfo: {},
    members: [],
    expenses: [],
    displayExpenses: [],
    aaResult: null,
    isLoading: true,
    isRefreshing: false,
    // 数据监听器
    expenseWatcher: null,
    memberWatcher: null
  },

  onLoad: function(options) {
    const { roomId } = options
    if (!roomId) {
      wx.showToast({
        title: '房间参数错误',
        icon: 'error'
      })
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/index/index' })
      }, 1500)
      return
    }

    this.setData({ roomId })
    this.loadRoomData()

    // 设置全局当前房间
    const currentRoom = app.getCurrentRoom()
    if (!currentRoom || currentRoom.roomId !== roomId) {
      // 从本地存储重新获取房间信息
      this.loadRoomFromStorage(roomId)
    }
  },

  onShow: function() {
    // 页面显示时刷新数据
    if (this.data.roomId) {
      this.refreshData()
    }
  },

  onUnload: function() {
    // 清理监听器
    this.cleanupWatchers()
  },

  onHide: function() {
    // 页面隐藏时清理监听器
    this.cleanupWatchers()
  },

  // 从本地存储加载房间信息
  loadRoomFromStorage: function(roomId) {
    try {
      const rooms = wx.getStorageSync('joinedRooms') || []
      const roomInfo = rooms.find(room => room.roomId === roomId)
      if (roomInfo) {
        app.setCurrentRoom(roomInfo)
      }
    } catch (err) {
      console.error('加载本地房间信息失败:', err)
    }
  },

  // 加载房间数据
  loadRoomData: function() {
    this.setData({ isLoading: true })
    Promise.all([
      this.loadRoomInfo(),
      this.loadMembers(),
      this.loadExpenses()
    ]).then(() => {
      this.calculateAA()
      this.setupDataWatchers()
      this.setData({ isLoading: false })
    }).catch(err => {
      console.error('加载房间数据失败:', err)
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      })
      this.setData({ isLoading: false })
    })
  },

  // 加载房间信息
  loadRoomInfo: function() {
    return new Promise((resolve, reject) => {
      const db = wx.cloud.database()
      db.collection('rooms').doc(this.data.roomId).get({
        success: (res) => {
          this.setData({
            roomInfo: res.data
          })
          resolve()
        },
        fail: (err) => {
          console.error('加载房间信息失败:', err)
          reject(err)
        }
      })
    })
  },

  // 加载成员列表
  loadMembers: function() {
    return new Promise((resolve, reject) => {
      const db = wx.cloud.database()
      db.collection('room_members')
        .where({
          roomId: this.data.roomId,
          isActive: true
        })
        .orderBy('joinedAt', 'asc')
        .get({
          success: (res) => {
            this.setData({
              members: res.data
            })
            resolve()
          },
          fail: (err) => {
            console.error('加载成员列表失败:', err)
            reject(err)
          }
        })
    })
  },

  // 加载支出记录
  loadExpenses: function() {
    return new Promise((resolve, reject) => {
      const db = wx.cloud.database()
      db.collection('expenses')
        .where({
          roomId: this.data.roomId,
          isSettled: false
        })
        .orderBy('date', 'desc')
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get({
          success: (res) => {
            this.setData({
              expenses: res.data,
              displayExpenses: res.data.slice(0, 3)
            })
            resolve()
          },
          fail: (err) => {
            console.error('加载支出记录失败:', err)
            reject(err)
          }
        })
    })
  },

  // 计算AA结果
  calculateAA: function() {
    const { expenses, members } = this.data

    if (expenses.length === 0 || members.length === 0) {
      this.setData({
        aaResult: null
      })
      return
    }

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
    let totalAmount = 0
    expenses.forEach(expense => {
      const payerId = expense.payerId
      const amount = expense.amount
      const participantCount = expense.participants.length
      const perPerson = amount / participantCount

      totalAmount += amount

      // 支付者增加支付额
      if (balances[payerId]) {
        balances[payerId].paid += amount
      }

      // 参与者增加应支付额
      expense.participants.forEach(participant => {
        if (balances[participant.userId]) {
          balances[participant.userId].shouldPay += perPerson
        }
      })
    })

    // 计算净额
    Object.keys(balances).forEach(userId => {
      balances[userId].net = balances[userId].paid - balances[userId].shouldPay
    })

    // 生成结算方案
    const settlement = this.generateSettlement(balances)

    this.setData({
      aaResult: {
        totalAmount,
        balances: Object.values(balances),
        settlement
      }
    })
  },

  // 生成最少转账的结算方案
  generateSettlement: function(balances) {
    const creditors = []
    const debtors = []

    Object.keys(balances).forEach(userId => {
      const net = balances[userId].net
      if (net > 0.01) { // 忽略微小金额
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
        amount: parseFloat(settleAmount.toFixed(2))
      })

      creditor.amount -= settleAmount
      debtor.amount -= settleAmount

      if (creditor.amount < 0.01) i++
      if (debtor.amount < 0.01) j++
    }

    return settlements
  },

  // 设置数据监听器
  setupDataWatchers: function() {
    this.cleanupWatchers()

    const db = wx.cloud.database()
    const _ = db.command

    // 监听支出变化
    this.data.expenseWatcher = db.collection('expenses')
      .where({
        roomId: this.data.roomId,
        isSettled: false
      })
      .watch({
        onChange: (snapshot) => {
          console.log('支出数据变化:', snapshot)
          this.setData({
            expenses: snapshot.docs,
            displayExpenses: snapshot.docs.slice(0, 3)
          })
          this.calculateAA()
        },
        onError: (err) => {
          console.error('监听支出数据失败:', err)
          // 降级为轮询
          this.startPolling()
        }
      })

    // 监听成员变化
    this.data.memberWatcher = db.collection('room_members')
      .where({
        roomId: this.data.roomId,
        isActive: true
      })
      .watch({
        onChange: (snapshot) => {
          console.log('成员数据变化:', snapshot)
          this.setData({
            members: snapshot.docs
          })
          this.calculateAA()
        },
        onError: (err) => {
          console.error('监听成员数据失败:', err)
        }
      })
  },

  // 清理监听器
  cleanupWatchers: function() {
    if (this.data.expenseWatcher) {
      this.data.expenseWatcher.close()
      this.setData({ expenseWatcher: null })
    }
    if (this.data.memberWatcher) {
      this.data.memberWatcher.close()
      this.setData({ memberWatcher: null })
    }
  },

  // 降级为轮询
  startPolling: function() {
    // 每10秒轮询一次
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer)
    }
    this.pollingTimer = setInterval(() => {
      this.refreshData()
    }, 10000)
  },

  // 刷新数据
  refreshData: function() {
    if (this.data.isRefreshing) return

    this.setData({ isRefreshing: true })
    Promise.all([
      this.loadMembers(),
      this.loadExpenses()
    ]).then(() => {
      this.calculateAA()
      this.setData({ isRefreshing: false })
    }).catch(err => {
      console.error('刷新数据失败:', err)
      this.setData({ isRefreshing: false })
    })
  },

  // 格式化日期
  formatDate: function(dateString) {
    if (!dateString) return ''
    const date = new Date(dateString)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today.getTime() - 86400000)

    if (date >= today) {
      return '今天'
    } else if (date >= yesterday) {
      return '昨天'
    } else {
      return `${date.getMonth() + 1}月${date.getDate()}日`
    }
  },

  // ========== 用户操作 ==========

  // 导航返回
  onNavBack: function() {
    wx.navigateBack()
  },

  // 更多操作
  onMoreTap: function() {
    wx.showActionSheet({
      itemList: ['刷新数据', '房间设置', '分享房间'],
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            this.refreshData()
            break
          case 1:
            // 房间设置（暂时为空）
            wx.showToast({
              title: '功能开发中',
              icon: 'none'
            })
            break
          case 2:
            this.onShareRoom()
            break
        }
      }
    })
  },

  // 分享房间
  onShareRoom: function() {
    const { roomInfo } = this.data
    wx.showModal({
      title: '分享房间',
      content: `房间密码：${roomInfo.roomCode}\n\n复制密码分享给朋友，他们可以通过"加入房间"功能输入密码加入。`,
      confirmText: '复制密码',
      cancelText: '关闭',
      success: (res) => {
        if (res.confirm) {
          this.onCopyRoomCode()
        }
      }
    })
  },

  // 复制房间密码
  onCopyRoomCode: function() {
    const { roomInfo } = this.data
    wx.setClipboardData({
      data: roomInfo.roomCode,
      success: () => {
        wx.showToast({
          title: '已复制到剪贴板',
          icon: 'success'
        })
      }
    })
  },

  // 跳转到添加支出
  goToAddExpense: function() {
    wx.navigateTo({
      url: `/pages/add-expense/index?roomId=${this.data.roomId}`
    })
  },

  // 跳转到结算页
  goToSettlement: function() {
    wx.navigateTo({
      url: `/pages/settlement/index?roomId=${this.data.roomId}`
    })
  },

  // 跳转到历史记录
  goToHistory: function() {
    wx.navigateTo({
      url: `/pages/history/index?roomId=${this.data.roomId}`
    })
  },

  // 跳转到全部支出
  goToAllExpenses: function() {
    wx.navigateTo({
      url: `/pages/all-expenses/index?roomId=${this.data.roomId}`
    })
  },

  // 跳转到支出统计
  goToStatistics: function() {
    wx.navigateTo({
      url: `/pages/expense-statistics/index?roomId=${this.data.roomId}`
    })
  },

  // 点击支出项
  onExpenseTap: function(e) {
    const expenseId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/expense-detail/index?roomId=${this.data.roomId}&expenseId=${expenseId}`
    })
  },

  // 刷新AA结果
  onRefreshAA: function() {
    this.refreshData()
    wx.showToast({
      title: '刷新中',
      icon: 'loading'
    })
  },

  // 离开房间
  onLeaveRoom: function() {
    wx.showModal({
      title: '离开房间',
      content: '确定要离开这个房间吗？离开后需要重新输入密码才能加入。',
      confirmText: '离开',
      confirmColor: '#ff4444',
      success: (res) => {
        if (res.confirm) {
          this.leaveRoom()
        }
      }
    })
  },

  // 执行离开房间
  leaveRoom: function() {
    const app = getApp()
    const userInfo = app.getUserInfo()
    const { roomId } = this.data

    wx.cloud.callFunction({
      name: 'leaveRoom',
      data: {
        roomId,
        userId: userInfo.userId
      },
      success: (res) => {
        if (res.result.success) {
          // 清除当前房间
          app.clearCurrentRoom()

          wx.showToast({
            title: '已离开房间',
            icon: 'success'
          })

          setTimeout(() => {
            wx.redirectTo({
              url: '/pages/index/index'
            })
          }, 1500)
        } else {
          wx.showToast({
            title: res.result.message || '离开失败',
            icon: 'error'
          })
        }
      },
      fail: (err) => {
        console.error('离开房间失败:', err)
        wx.showToast({
          title: '网络错误',
          icon: 'error'
        })
      }
    })
  }
})