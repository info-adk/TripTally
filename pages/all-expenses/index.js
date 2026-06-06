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
    const roomId = this.data.roomId
    const _this = this

    // 分页获取全部支出记录（微信云数据库单次最多返回20条）
    const MAX_LIMIT = 20

    // 获取单页数据
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
    getPage(0).then(firstBatch => {
      if (firstBatch.length < MAX_LIMIT) {
        // 不足一页，没有更多数据
        const expenses = firstBatch
        const groupedExpenses = _this.groupExpensesByDate(expenses)
        _this.setData({ expenses, groupedExpenses, isLoading: false })
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
        const groupedExpenses = _this.groupExpensesByDate(expenses)
        _this.setData({ expenses, groupedExpenses, isLoading: false })
      })
    }).catch(err => {
      console.error('加载支出失败:', err)
      wx.showToast({ title: '加载失败', icon: 'error' })
      _this.setData({ isLoading: false })
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