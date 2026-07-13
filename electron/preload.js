'use strict';

// 预加载脚本：在隔离的渲染层与主进程之间建立唯一、受控的桥。
// 所有敏感操作（API Key 加解密、会议数据库读写）都在主进程完成，渲染层只拿到封装好的异步方法。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  db: {
    createMeeting: (data) => ipcRenderer.invoke('db:createMeeting', data),
    appendMessage: (meetingId, msg) => ipcRenderer.invoke('db:appendMessage', meetingId, msg),
    listMeetings: () => ipcRenderer.invoke('db:listMeetings'),
    getMeeting: (id) => ipcRenderer.invoke('db:getMeeting', id),
    deleteMeeting: (id) => ipcRenderer.invoke('db:deleteMeeting', id),
    updateMeeting: (id, patch) => ipcRenderer.invoke('db:updateMeeting', id, patch)
  },
  keys: {
    listProviders: () => ipcRenderer.invoke('key:listProviders'),
    setProvider: (key, cfg) => ipcRenderer.invoke('key:setProvider', key, cfg),
    deleteProvider: (key) => ipcRenderer.invoke('key:deleteProvider', key),
    getDecryptedKey: (key) => ipcRenderer.invoke('key:getDecryptedKey', key),
    migrate: (legacy) => ipcRenderer.invoke('key:migrate', legacy)
  }
});
