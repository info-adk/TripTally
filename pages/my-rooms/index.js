// pages/my-rooms/index.js
const app = getApp()

Page({
  data: {
    rooms: []
  },

  onLoad: function() {
    this.loadJoinedRooms()
  },

  onShow: function() {
    this.loadJoinedRooms()
  },

  loadJoinedRooms: function() {
    const rooms = app.getJoinedRooms()
    this.setData({ rooms })
  },

  onRoomTap: function(e) {
    const room = e.currentTarget.dataset.room
    if (room && room.roomId) {
      // 设置为当前房间
      app.setCurrentRoom(room)
      // 跳转到房间详情
      wx.navigateTo({
        url: `/pages/room-detail/index?roomId=${room.roomId}`
      })
    }
  },

  goToCreateRoom: function() {
    wx.navigateTo({
      url: '/pages/create-room/index'
    })
  },

  goToJoinRoom: function() {
    wx.navigateTo({
      url: '/pages/join-room/index'
    })
  },

  // 离开房间
  onLeaveRoom: function(e) {
    const room = e.currentTarget.dataset.room
    if (!room) return

    const isCreator = room.isCreator
    const title = isCreator ? '退出房间' : '离开房间'
    const content = isCreator
      ? '作为创建者退出后，房间将由其他成员继续使用。确定要退出吗？'
      : '确定要离开这个房间吗？'

    wx.showModal({
      title,
      content,
      success: (res) => {
        if (res.confirm) {
          this.doLeaveRoom(room)
        }
      }
    })
  },

  // 执行离开房间
  doLeaveRoom: function(room) {
    const userInfo = app.getUserInfo()

    wx.cloud.callFunction({
      name: 'leaveRoom',
      data: {
        roomId: room.roomId,
        userId: userInfo.userId,
        userName: userInfo.userName
      },
      success: (res) => {
        if (res.result.success) {
          // 从本地列表移除
          app.removeFromJoinedRooms(room.roomId)
          this.loadJoinedRooms()
          wx.showToast({
            title: '已离开房间',
            icon: 'success'
          })
        } else {
          wx.showToast({
            title: res.result.message || '操作失败',
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