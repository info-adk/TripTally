// pages/all-expenses/index.js
const app = getApp()

Page({
  data: {
    roomId: '',
    expenses: [],
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
    this.loadExpenses()
  },

  onShow: function() {
    if (this.data.roomId) {
      this.loadExpenses()
    }
  },

  loadExpenses: function() {
    this.setData({ isLoading: true })

    const db = wx.cloud.database()
    db.collection('expenses')
      .where({
        roomId: this.data.roomId
      })
      .orderBy('createdAt', 'desc')
      .get({
        success: (res) => {
          const expenses = res.data || []
          const groupedExpenses = this.groupExpensesByDate(expenses)
          this.setData({
            expenses: expenses,
            groupedExpenses: groupedExpenses,
            isLoading: false
          })
        },
        fail: (err) => {
          console.error('加载支出失败:', err)
          wx.showToast({
            title: '加载失败',
            icon: 'error'
          })
          this.setData({ isLoading: false })
        }
      })
  },

  groupExpensesByDate: function(expenses) {
    const groups = {}
    expenses.forEach(expense => {
      const dateStr = expense.date || expense.createdAt
      if (!dateStr) return
      const dateKey = dateStr.substr(0, 10)
      if (!groups[dateKey]) {
        groups[dateKey] = {
          date: dateKey,
          total: 0,
          expenses: []
        }
      }
      groups[dateKey].expenses.push(expense)
      groups[dateKey].total = Math.round((groups[dateKey].total + expense.amount) * 100) / 100
    })
    return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date))
  },

  // 点击支出项
  onExpenseTap: function(e) {
    const expenseId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/expense-detail/index?roomId=${this.data.roomId}&expenseId=${expenseId}`
    })
  }
})