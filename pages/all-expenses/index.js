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
          this.setData({
            expenses: res.data || [],
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

  // 点击支出项
  onExpenseTap: function(e) {
    const expenseId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/expense-detail/index?roomId=${this.data.roomId}&expenseId=${expenseId}`
    })
  }
})