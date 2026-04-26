// pages/create-room/index.js
const app = getApp()

Page({
  data: {
    roomName: '',
    isLoading: false,
    errorMessage: ''
  },

  onLoad: function() {
  },

  // 处理房间名称输入
  onRoomNameInput: function(e) {
    this.setData({
      roomName: e.detail.value.trim()
    })
  },

  // 创建房间
  onCreateRoom: function() {
    const app = getApp()
    const userInfo = app.getUserInfo()
    const { roomName } = this.data

    this.setData({
      isLoading: true,
      errorMessage: ''
    })

    // 调用云函数创建房间
    wx.cloud.callFunction({
      name: 'createRoom',
      data: {
        roomName: roomName || '未命名旅行',
        userName: userInfo.userName,
        ...(userInfo.avatarUrl ? { avatarUrl: userInfo.avatarUrl } : {})
      },
      success: (res) => {
        if (res.result.success) {
          const { roomId, roomCode, roomName } = res.result
          console.log('房间创建成功:', res.result)

          // 设置当前房间
          const roomInfo = {
            roomId,
            roomCode,
            roomName,
            isCreator: true
          }
          app.setCurrentRoom(roomInfo)

          this.setData({ isLoading: false })

          // 跳转到房间详情页
          wx.navigateTo({
            url: `/pages/room-detail/index?roomId=${roomId}`
          })
        } else {
          this.setData({
            errorMessage: res.result.message || '创建房间失败',
            isLoading: false
          })
        }
      },
      fail: (err) => {
        console.error('创建房间失败:', err)
        this.setData({
          errorMessage: '网络错误，请稍后重试',
          isLoading: false
        })
      }
    })
  },

  // 跳转到加入房间页面
  goToJoinRoom: function() {
    wx.navigateTo({
      url: '/pages/join-room/index'
    })
  }
})