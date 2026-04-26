// pages/expense-detail/index.js
const app = getApp()

Page({
  data: {
    roomId: '',
    expenseId: '',
    expense: null,
    canEdit: false,
    isLoading: true,
    showDeleteConfirm: false,
    showSwipeDelete: false,
    swipeOffset: 0,
    swipeStartX: 0,
    // 房间信息
    roomInfo: null,
    currentUserName: ''
  },

  onLoad: function(options) {
    const { roomId, expenseId } = options
    if (!roomId || !expenseId) {
      wx.showToast({
        title: '参数错误',
        icon: 'error'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }

    this.setData({
      roomId,
      expenseId,
      currentUserName: app.getUserInfo().userName
    })

    this.loadExpenseDetail()
    this.loadRoomInfo()
  },

  onShow: function() {
    // 页面显示时刷新数据
    if (this.data.expenseId) {
      this.loadExpenseDetail()
      this.loadRoomInfo()
    }
  },

  // 加载支出详情
  loadExpenseDetail: function() {
    const db = wx.cloud.database()
    db.collection('expenses').doc(this.data.expenseId).get({
      success: (res) => {
        const expense = res.data
        this.setData({
          expense,
          isLoading: false
        })
        this.checkEditPermission()
      },
      fail: (err) => {
        console.error('加载支出详情失败:', err)
        wx.showToast({
          title: '加载失败',
          icon: 'error'
        })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      }
    })
  },

  // 加载房间信息
  loadRoomInfo: function() {
    const db = wx.cloud.database()
    db.collection('rooms').doc(this.data.roomId).get({
      success: (res) => {
        this.setData({
          roomInfo: res.data
        })
        this.checkEditPermission()
      },
      fail: (err) => {
        console.error('加载房间信息失败:', err)
      }
    })
  },

  // 检查编辑权限
  checkEditPermission: function() {
    const { expense, roomInfo, currentUserName } = this.data
    if (!expense || !roomInfo) return

    let canEdit = false

    // 支付者可以编辑
    if (expense.payerName === currentUserName) {
      canEdit = true
    }

    // 房间创建者可以编辑
    if (roomInfo.creatorName === currentUserName) {
      canEdit = true
    }

    this.setData({ canEdit })
  },

  // 格式化日期
  formatDate: function(dateString) {
    if (!dateString) return ''
    const date = new Date(dateString)
    return `${date.getMonth() + 1}月${date.getDate()}日`
  },

  // 格式化日期时间
  formatDateTime: function(dateString) {
    if (!dateString) return ''
    const date = new Date(dateString)
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  },

  // ========== 编辑操作 ==========

  // 编辑支出
  onEdit: function() {
    if (!this.data.canEdit) {
      wx.showToast({
        title: '无编辑权限',
        icon: 'error'
      })
      return
    }

    // 跳转到编辑页面
    wx.navigateTo({
      url: `/pages/add-expense/index?roomId=${this.data.roomId}&expenseId=${this.data.expenseId}`
    })
  },

  // ========== 删除操作 ==========

  // 删除支出
  onDelete: function() {
    if (!this.data.canEdit) {
      wx.showToast({
        title: '无删除权限',
        icon: 'error'
      })
      return
    }

    // 显示滑动删除确认
    this.setData({
      showSwipeDelete: true,
      swipeOffset: 0
    })
  },

  // 滑动开始
  onSwipeStart: function(e) {
    this.setData({
      swipeStartX: e.touches[0].clientX
    })
  },

  // 滑动移动
  onSwipeMove: function(e) {
    const currentX = e.touches[0].clientX
    const deltaX = currentX - this.data.swipeStartX

    // 只允许向右滑动
    if (deltaX > 0) {
      const offset = Math.min(deltaX, 200) // 最大滑动200rpx
      this.setData({
        swipeOffset: offset
      })
    }
  },

  // 滑动结束
  onSwipeEnd: function() {
    const { swipeOffset } = this.data
    if (swipeOffset >= 150) {
      // 滑动足够远，显示最终确认
      this.setData({
        showSwipeDelete: false,
        showDeleteConfirm: true
      })
    } else {
      // 滑动不够，回弹
      this.setData({
        swipeOffset: 0
      })
    }
  },

  // 取消滑动删除
  onCancelSwipeDelete: function() {
    this.setData({
      showSwipeDelete: false,
      swipeOffset: 0
    })
  },

  // 取消删除
  onCancelDelete: function() {
    this.setData({
      showDeleteConfirm: false
    })
  },

  // 确认删除
  onConfirmDelete: function() {
    const app = getApp()
    const userInfo = app.getUserInfo()

    wx.cloud.callFunction({
      name: 'deleteExpense',
      data: {
        expenseId: this.data.expenseId,
        roomId: this.data.roomId,
        userName: userInfo.userName
      },
      success: (res) => {
        if (res.result.success) {
          wx.showToast({
            title: '删除成功',
            icon: 'success'
          })

          // 返回上一页
          setTimeout(() => {
            wx.navigateBack()
          }, 1500)
        } else {
          wx.showToast({
            title: res.result.message || '删除失败',
            icon: 'error'
          })
        }
        this.setData({
          showDeleteConfirm: false
        })
      },
      fail: (err) => {
        console.error('删除支出失败:', err)
        wx.showToast({
          title: '网络错误',
          icon: 'error'
        })
        this.setData({
          showDeleteConfirm: false
        })
      }
    })
  }
})